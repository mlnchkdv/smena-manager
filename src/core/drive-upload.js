// A File is sliced per request; neither the file nor its chunks are copied into storage.
export class UploadTransferError extends Error {
  constructor(message, status = 0, code = 'DIRECT_UPLOAD_FAILED') {
    super(message);
    Object.assign(this, { status, code });
  }
}

export function acceptedUploadBytes(range, size) {
  if (!range) return 0;
  const match = /^bytes=0-(\d+)$/.exec(range.trim());
  const bytes = match ? Number(match[1]) + 1 : NaN;
  if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > size) throw new UploadTransferError('Invalid upload progress.');
  return bytes;
}

const cancelled = () => new UploadTransferError('Upload cancelled.', 0, 'UPLOAD_CANCELLED');
const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(cancelled());
    const abort = () => {
      clearTimeout(timer);
      reject(cancelled());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', abort, { once: true });
  });

export async function uploadDriveChunks(uploadUrl, file, chunkSizeBytes, options = {}) {
  const { signal, onProgress, onAccepted, assertScope = () => {}, xhrFactory = () => new XMLHttpRequest(), wait = sleep, resume = false } = options;
  const url = new URL(uploadUrl);
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'www.googleapis.com' ||
    url.port ||
    url.username ||
    url.password ||
    url.hash ||
    !url.pathname.startsWith('/upload/drive/')
  )
    throw new UploadTransferError('Invalid upload destination.');
  if (!Number.isSafeInteger(file?.size) || file.size <= 0) throw new UploadTransferError('Invalid file size.');
  const chunkSize = Math.max(256 * 1024, Math.min(8 * 1024 * 1024, Math.floor(chunkSizeBytes / (256 * 1024)) * 256 * 1024 || 8 * 1024 * 1024));
  const check = () => {
    assertScope();
    if (signal?.aborted) throw cancelled();
  };
  const send = (start, end, probe) =>
    new Promise((resolve, reject) => {
      try {
        check();
      } catch (error) {
        reject(error);
        return;
      }
      const xhr = xhrFactory();
      const abort = () => xhr.abort();
      const fail = () => reject(new UploadTransferError('Google Drive is unavailable. Try the upload again.', 0, 'DIRECT_UPLOAD_NETWORK_ERROR'));
      xhr.open('PUT', uploadUrl);
      xhr.setRequestHeader('Content-Range', probe ? `bytes */${file.size}` : `bytes ${start}-${end - 1}/${file.size}`);
      if (!probe) xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.responseType = 'json';
      xhr.timeout = 120000;
      signal?.addEventListener('abort', abort, { once: true });
      xhr.onloadend = () => signal?.removeEventListener('abort', abort);
      xhr.onerror = xhr.ontimeout = fail;
      xhr.onabort = () => reject(cancelled());
      xhr.upload.onprogress = event => {
        if (!probe && event.lengthComputable && !signal?.aborted)
          onProgress?.(Math.min(99, Math.floor(((start + event.loaded) / file.size) * 100)), Math.min(file.size, start + event.loaded));
      };
      xhr.onload = () => resolve({ status: xhr.status, body: xhr.response || {}, range: xhr.getResponseHeader('Range') });
      xhr.send(probe ? null : file.slice(start, end));
    });
  const retryable = response =>
    [408, 429].includes(response.status) ||
    response.status >= 500 ||
    (response.status === 403 && response.body?.error?.errors?.some(error => /rateLimitExceeded|userRateLimitExceeded/.test(error.reason)));
  let offset = 0,
    probe = resume,
    failures = 0;
  while (true) {
    check();
    let result;
    try {
      result = await send(offset, Math.min(file.size, offset + chunkSize), probe);
    } catch (error) {
      check();
      if (error.code !== 'DIRECT_UPLOAD_NETWORK_ERROR' || ++failures > 5) throw error;
      await wait(Math.min(8000, 500 * 2 ** (failures - 1)), signal);
      probe = true;
      continue;
    }
    check();
    if (result.status >= 200 && result.status < 300) {
      onAccepted?.(file.size);
      onProgress?.(100, file.size);
      return result.body;
    }
    if (result.status === 404 || result.status === 410)
      throw new UploadTransferError('Upload session expired. Start this file again.', result.status, 'UPLOAD_SESSION_EXPIRED');
    if (result.status === 308) {
      const next = acceptedUploadBytes(result.range, file.size);
      if (next === file.size || (!probe && next <= offset)) {
        if (++failures > 5) throw new UploadTransferError('Google Drive did not confirm upload progress.');
        await wait(Math.min(8000, 500 * 2 ** (failures - 1)), signal);
        probe = true;
        continue;
      }
      offset = next;
      onAccepted?.(offset);
      onProgress?.(Math.min(99, Math.floor((offset / file.size) * 100)), offset);
      failures = 0;
      probe = false;
      continue;
    }
    if (!retryable(result) || ++failures > 5) throw new UploadTransferError(`Google Drive rejected the upload (${result.status}).`, result.status);
    await wait(Math.min(8000, 500 * 2 ** (failures - 1)), signal);
    probe = true;
  }
}
