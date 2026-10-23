import { createHash } from 'node:crypto';
const table = Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = (n >>> 1) ^ (n & 1 ? 0xedb88320 : 0);
  return n >>> 0;
});
export function updateCrc32(crc, bytes) {
  let n = (crc ^ 0xffffffff) >>> 0;
  for (const byte of bytes) n = (n >>> 8) ^ table[(n ^ byte) & 255];
  return (n ^ 0xffffffff) >>> 0;
}
export const exportDigest = bytes => createHash('sha256').update(bytes).digest('hex');

// STORE entries keep the result deterministic and independently range-readable.
// Parts are bounded immutable objects, not a whole-archive memory buffer.
export function exportZipLayout(entries) {
  const segments = [],
    central = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.path, 'utf8'),
      start = offset;
    if (name.length > 65535 || !Number.isSafeInteger(entry.file.bytes) || entry.file.bytes < 0 || entry.offset !== entry.file.bytes)
      throw Error('Incomplete export.');
    const header = Buffer.alloc(30 + name.length);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x800, 6);
    header.writeUInt16LE(33, 12);
    header.writeUInt32LE(entry.crc || 0, 14);
    header.writeUInt32LE(entry.file.bytes, 18);
    header.writeUInt32LE(entry.file.bytes, 22);
    header.writeUInt16LE(name.length, 26);
    name.copy(header, 30);
    segments.push({ buffer: header, start: offset, size: header.length });
    offset += header.length;
    let bytes = 0;
    for (const part of entry.parts) {
      segments.push({ part, start: offset, size: part.bytes });
      offset += part.bytes;
      bytes += part.bytes;
    }
    if (bytes !== entry.file.bytes) throw Error('Incomplete export.');
    const item = Buffer.alloc(46 + name.length);
    item.writeUInt32LE(0x02014b50);
    item.writeUInt16LE(20, 4);
    item.writeUInt16LE(20, 6);
    item.writeUInt16LE(0x800, 8);
    item.writeUInt16LE(33, 14);
    item.writeUInt32LE(entry.crc || 0, 16);
    item.writeUInt32LE(entry.file.bytes, 20);
    item.writeUInt32LE(entry.file.bytes, 24);
    item.writeUInt16LE(name.length, 28);
    item.writeUInt32LE(start, 42);
    name.copy(item, 46);
    central.push(item);
  }
  const centralStart = offset,
    directory = Buffer.concat(central),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(centralStart, 16);
  const tail = Buffer.concat([directory, end]);
  segments.push({ buffer: tail, start: offset, size: tail.length });
  offset += tail.length;
  const digest = exportDigest(JSON.stringify(entries.map(entry => [entry.path, entry.file.bytes, entry.crc, entry.parts.map(part => part.sha256)])));
  return { segments, bytes: offset, digest };
}

export async function readExportPart(storage, file, { start, end, signal, expectedSize } = {}) {
  signal?.throwIfAborted();
  const pending = storage.openDownloadStream(file.storageName, file.storageFileId, start == null ? undefined : { start, end });
  // Provider calls have their own timeout. A late response is still destroyed.
  const result = await new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal?.addEventListener('abort', abort, { once: true });
    pending.then(
      value => {
        signal?.removeEventListener('abort', abort);
        if (signal?.aborted) {
          value?.stream?.destroy();
          reject(signal.reason);
        } else resolve(value);
      },
      error => {
        signal?.removeEventListener('abort', abort);
        reject(error);
      },
    );
  });
  if (!result) throw Error('Stored export content is unavailable.');
  const abort = () => result.stream.destroy(signal.reason);
  if (signal?.aborted) {
    result.stream.destroy();
    signal.throwIfAborted();
  }
  signal?.addEventListener('abort', abort, { once: true });
  const chunks = [];
  let bytes = 0;
  try {
    for await (const chunk of result.stream) {
      signal?.throwIfAborted();
      bytes += chunk.length;
      if (bytes > expectedSize) throw Error('Export content size changed.');
      chunks.push(chunk);
    }
    if (bytes !== expectedSize || (file.bytes != null && result.size !== file.bytes)) throw Error('Export content size changed.');
    return Buffer.concat(chunks);
  } finally {
    signal?.removeEventListener('abort', abort);
    result.stream.destroy();
  }
}
