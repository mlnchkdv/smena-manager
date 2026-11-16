import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

function allowedDestination(value, origin) {
  const url = new URL(value),
    local = new URL(origin);
  if (
    url.username ||
    url.password ||
    url.hash ||
    !(
      (url.protocol === 'https:' && url.hostname === 'www.googleapis.com' && !url.port && url.pathname.startsWith('/upload/drive/')) ||
      (local.hostname === '127.0.0.1' && url.origin === local.origin && url.pathname.startsWith('/upload/drive/'))
    )
  )
    throw new Error('Invalid upload destination.');
  return url;
}
function accepted(response, size) {
  const range = response.headers.get('range');
  if (!range) return 0;
  const match = /^bytes=0-(\d+)$/.exec(range);
  const count = match ? Number(match[1]) + 1 : NaN;
  if (!Number.isSafeInteger(count) || count < 0 || count > size) throw new Error('Invalid upload checkpoint.');
  return count;
}
export async function uploadLocalFile({
  client,
  journal,
  file,
  workspaceId,
  projectId,
  folderId = null,
  operationId,
  mimeType = 'application/octet-stream',
  fetch = globalThis.fetch,
  onProgress = () => {},
}) {
  if (!file || !workspaceId || !projectId || !/^[a-f0-9-]{36}$/.test(operationId || ''))
    throw new Error('Supply --file, --workspace, --project and an operation UUID. Preserve that UUID when resuming.');
  const before = await fs.stat(file);
  if (!before.isFile() || !Number.isSafeInteger(before.size) || before.size <= 0) throw new Error('Select a non-empty regular file.');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  const sha256 = hash.digest('hex'),
    base = `/workspaces/${encodeURIComponent(workspaceId)}`;
  const body = { name: path.basename(file), size: before.size, mime_type: mimeType, project_id: projectId, folder_id: folderId, sha256 };
  await journal.reserve(operationId, client.origin, 'POST', base + '/uploads', body);
  const started = await client.call('POST', base + '/uploads', { body, operationId });
  const uploadPath = base + '/uploads/' + encodeURIComponent(started.upload_id);
  const transport = await client.call('GET', uploadPath + '/transport');
  if (transport.completed) {
    await journal.mark(operationId, 'completed', transport.file);
    return transport.file;
  }
  if (transport.sha256 !== sha256 || transport.size !== before.size) throw new Error('The selected file does not match this upload.');
  const destination = allowedDestination(transport.uploadUrl, client.origin);
  let offset = 0,
    uploadedId = '',
    registeredResult = null,
    failures = 0;
  const send = async (content, range) => {
    const response = await fetch(destination, {
      method: 'PUT',
      headers: { 'Content-Type': mimeType, 'Content-Range': range },
      body: content,
      // Drive uses 308 without Location as a resumable checkpoint. Fetch's
      // "error" mode rejects that status too; manual mode never follows it.
      redirect: 'manual',
      signal: AbortSignal.timeout(60000),
    });
    if (response.status >= 300 && response.status < 400 && (response.status !== 308 || response.headers.get('location')))
      throw Object.assign(new Error('Upload redirects are not allowed.'), { code: 'UPLOAD_REDIRECT_REFUSED' });
    return response;
  };
  async function probe() {
    const response = await send(Buffer.alloc(0), `bytes */${before.size}`);
    if (response.status === 308) {
      offset = accepted(response, before.size);
      return;
    }
    if (response.ok) {
      const result = await response.json();
      uploadedId = result.id || '';
      offset = before.size;
      return;
    }
    if (response.status === 404 || response.status === 410) {
      const completed = await client.call('POST', uploadPath + '/complete', { body: {}, operationId: operationId + ':complete' });
      registeredResult = completed;
      offset = before.size;
      return;
    }
    throw Object.assign(new Error('Upload checkpoint is unavailable.'), { code: 'UPLOAD_CHECKPOINT_UNAVAILABLE' });
  }
  await probe();
  const handle = await fs.open(file, 'r');
  try {
    while (offset < before.size) {
      const now = await handle.stat();
      if (now.size !== before.size || now.mtimeMs !== before.mtimeMs) throw new Error('The file changed while uploading.');
      const length = Math.min(8 * 1024 * 1024, before.size - offset),
        buffer = Buffer.allocUnsafe(length);
      const { bytesRead } = await handle.read(buffer, 0, length, offset);
      if (bytesRead !== length) throw new Error('The file changed while uploading.');
      const start = offset;
      try {
        const response = await send(buffer, `bytes ${start}-${start + length - 1}/${before.size}`);
        if (response.status === 308) {
          offset = accepted(response, before.size);
          if (offset <= start || offset > start + length) throw new Error('Invalid upload progress.');
        } else if (response.ok) {
          const value = await response.json();
          uploadedId = value.id || '';
          offset = before.size;
        } else throw Object.assign(new Error('Upload interrupted.'), { code: 'UPLOAD_INTERRUPTED' });
        failures = 0;
        onProgress(offset, before.size);
      } catch (error) {
        if (++failures > 5) {
          await journal.mark(operationId, 'uncertain');
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, Math.min(5000, 250 * 2 ** failures)));
        await client.call('GET', uploadPath + '/transport');
        await probe();
      }
    }
  } finally {
    await handle.close();
  }
  const complete =
    registeredResult ||
    (await client.call('POST', uploadPath + '/complete', {
      body: uploadedId ? { file_id: uploadedId } : {},
      operationId: operationId + ':complete',
    }));
  await journal.mark(operationId, 'completed', complete);
  return complete;
}
