import { Zip, ZipPassThrough } from 'fflate';
import { FILE_ZIP_MAX_BYTES, ZIP_LIMIT_MESSAGE } from './file-archive-policy.js';

// Sequential reads and uncompressed ZIP chunks bound memory and avoid
// unnecessary CPU work for already-compressed images, PDFs and archives.
export async function buildFileZip(plan, read, { signal, validate = () => {}, onProgress = () => {} } = {}) {
  const chunks = [];
  let zipError,
    bytes = 0,
    done = 0;
  const zip = new Zip((error, chunk) => {
    if (error) zipError = error;
    else chunks.push(chunk);
  });
  const check = () => {
    signal?.throwIfAborted();
    validate();
    if (zipError) throw zipError;
  };
  for (const item of plan) {
    check();
    const content = await read(item.file, {
      signal,
      maxBytes: FILE_ZIP_MAX_BYTES - bytes,
      onProgress: loaded => onProgress({ done, total: plan.length, bytes: bytes + loaded }),
    });
    check();
    if (!(content instanceof Uint8Array)) throw Error('Unable to create the ZIP.');
    bytes += content.byteLength;
    if (bytes > FILE_ZIP_MAX_BYTES) throw Error(ZIP_LIMIT_MESSAGE);
    const entry = new ZipPassThrough(item.path);
    zip.add(entry);
    entry.push(content, true);
    done++;
    onProgress({ done, total: plan.length, bytes });
  }
  check();
  zip.end();
  check();
  return new Blob(chunks, { type: 'application/zip' });
}
