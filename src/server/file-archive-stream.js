import { Zip, ZipPassThrough } from 'fflate';
import { once } from 'node:events';
import { STREAM_ZIP_POLICY } from '../shared/file-archive-policy.js';

// No complete file or ZIP buffer. Each input chunk is capped at 64 KiB and
// backpressure is honored before asking Drive for the next chunk.
export async function streamFileArchive(plan, output, read, { signal, validate = async () => {}, maxBytes = STREAM_ZIP_POLICY.maxBytes } = {}) {
  let zipError,
    blocked = false,
    bytes = 0,
    source;
  const zip = new Zip((error, chunk) => {
    if (error) zipError = error;
    else if (!output.write(chunk)) blocked = true;
  });
  const check = () => {
    signal?.throwIfAborted();
    if (zipError) throw zipError;
  };
  const drain = async () => {
    if (blocked) {
      blocked = false;
      await once(output, 'drain', { signal });
    }
    check();
  };
  const abort = () => source?.destroy();
  signal?.addEventListener('abort', abort, { once: true });
  try {
    for (const item of plan) {
      check();
      await validate(item.file);
      check();
      const opened = await read(item.file, signal);
      source = opened?.stream;
      if (!source) throw Error('Stored file is unavailable.');
      check();
      if (Number(opened.size) > maxBytes - bytes) throw Error(STREAM_ZIP_POLICY.limitMessage);
      const entry = new ZipPassThrough(item.path);
      zip.add(entry);
      await drain();
      const before = bytes;
      for await (const input of source) {
        const chunk = Buffer.isBuffer(input) ? input : Buffer.from(input);
        for (let offset = 0; offset < chunk.length; offset += 65536) {
          check();
          const part = chunk.subarray(offset, offset + 65536);
          bytes += part.length;
          if (bytes > maxBytes) throw Error(STREAM_ZIP_POLICY.limitMessage);
          entry.push(part, false);
          await drain();
        }
      }
      source = null;
      check();
      if (Number.isFinite(Number(opened.size)) && bytes - before !== Number(opened.size)) throw Error('Stored file is incomplete.');
      entry.push(new Uint8Array(), true);
      await drain();
    }
    check();
    zip.end();
    await drain();
    output.end();
    return bytes;
  } catch (error) {
    source?.destroy();
    zip.terminate();
    throw error;
  } finally {
    signal?.removeEventListener('abort', abort);
  }
}
