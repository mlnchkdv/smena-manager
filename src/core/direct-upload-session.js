import { uploadDriveChunks } from './drive-upload.js';

let registrationTail = Promise.resolve();

// Kept separate from API bootstrap so large-transfer recovery stays lazy-loaded.
export async function uploadDirectFile(file, metadata, onProgress, { request, assertScope, transfer = uploadDriveChunks }) {
  const resumed = Boolean(metadata.checkpoint?.uploadUrl);
  const session =
    metadata.checkpoint ||
    (await request(
      '/api/files/upload-session',
      {
        method: 'POST',
        signal: metadata.signal,
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          mimeType: file.type || 'application/octet-stream',
          project: metadata.project || '',
          folderId: metadata.folderId || null,
          task: metadata.task || '',
        }),
      },
      true,
    ));
  assertScope();
  await metadata.onCheckpoint?.(session);
  const authorize = async () => {
    const checked = await request(
      '/api/files/upload-check',
      { method: 'POST', signal: metadata.signal, body: JSON.stringify({ ticket: session.ticket }) },
      true,
    );
    assertScope();
    if (checked.ticket) session.ticket = checked.ticket;
    await metadata.onCheckpoint?.(session);
  };
  if (resumed) await authorize();
  const uploaded =
    session.uploaded ||
    (await transfer(session.uploadUrl, file, session.chunkSizeBytes || 8 * 1024 * 1024, {
      onProgress,
      signal: metadata.signal,
      resume: resumed,
      assertScope,
      onAccepted: bytes => metadata.onAccepted?.(bytes),
    }));
  assertScope();
  session.uploaded = uploaded;
  await metadata.onCheckpoint?.(session);
  metadata.onVerifying?.();
  // Retrying a lost catalog response reuses the uploaded ID; it never sends bytes
  // again. Renew after a long transfer, rechecking current account/project rights.
  const register = async () => {
    assertScope();
    await authorize();
    const result = await request(
      '/api/files/upload-complete',
      {
        method: 'POST',
        signal: metadata.signal,
        body: JSON.stringify({ ticket: session.ticket, fileId: uploaded.id || '' }),
      },
      true,
    );
    assertScope();
    metadata.onRegistered?.(result);
    return result;
  };
  const pending = registrationTail.then(register, register);
  registrationTail = pending.catch(() => {});
  return pending;
}
