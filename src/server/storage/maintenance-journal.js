import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { addAbortSignal } from 'node:stream';
import { renameWithRetry } from './windows-file-retry.js';

const MAX = 8 * 1024 * 1024;
const name = 'smena-storage-inspection.json';
const marker = 'smenaStorageInspection';
const digest = value => createHash('sha256').update(value).digest('hex');
const fail = (code = 'STORAGE_INSPECTION_INTEGRITY', statusCode = 503) =>
  Object.assign(new Error('Storage inspection progress is unavailable.'), { code, statusCode });
const conflict = () => fail('INSPECTION_CONFLICT', 409);
const queues = new Map();
function serial(key, work) {
  const before = queues.get(key) || Promise.resolve();
  const result = before.catch(() => {}).then(work);
  queues.set(key, result);
  return result.finally(() => {
    if (queues.get(key) === result) queues.delete(key);
  });
}
function encode(payload) {
  const text = JSON.stringify({ format: 'smena-storage-inspection-journal-v1', payload });
  if (Buffer.byteLength(text) > MAX) throw fail('INSPECTION_CAPACITY', 413);
  return text;
}
function decode(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > MAX) throw fail();
  let envelope;
  try {
    envelope = JSON.parse(text);
  } catch {
    throw fail();
  }
  if (envelope?.format !== 'smena-storage-inspection-journal-v1' || !envelope.payload || typeof envelope.payload !== 'object') throw fail();
  return envelope.payload;
}
async function localParent(storage) {
  const directory = path.dirname(storage.databasePath),
    stat = await fs.lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw fail();
  return directory;
}
export function localMaintenanceJournal(storage) {
  const filename = path.join(path.dirname(storage.databasePath), name);
  async function read() {
    await localParent(storage);
    let handle;
    try {
      if ((await fs.lstat(filename)).isSymbolicLink()) throw fail();
      handle = await fs.open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > MAX) throw fail();
      const text = await handle.readFile('utf8');
      return { payload: decode(text), token: digest(text) };
    } catch (error) {
      if (error.code === 'ENOENT') return { payload: null, token: null };
      throw error;
    } finally {
      await handle?.close();
    }
  }
  return {
    read,
    // Local deployments use one Node writer, as does the workspace store. This
    // queue also covers multiple provider instances in that process.
    save(payload, expected) {
      return serial(filename, async () => {
        const text = encode(payload),
          current = await read();
        if (current.token !== expected) throw conflict();
        const temporary = filename + '.' + randomUUID() + '.tmp';
        let handle;
        try {
          handle = await fs.open(temporary, 'wx', 0o600);
          await handle.writeFile(text, 'utf8');
          await handle.sync();
          await handle.close();
          handle = null;
          if ((await read()).token !== expected) throw conflict();
          await renameWithRetry(temporary, filename);
        } finally {
          await handle?.close();
          await fs.unlink(temporary).catch(() => {});
        }
        return { payload, token: digest(text) };
      });
    },
  };
}

const quote = value => String(value).replaceAll('\\', '\\\\').replaceAll("'", "\\'");
async function bounded(stream, signal) {
  let size = 0;
  const chunks = [];
  addAbortSignal(signal, stream);
  try {
    for await (const chunk of stream) {
      signal.throwIfAborted();
      const buffer = Buffer.from(chunk);
      size += buffer.length;
      if (size > MAX) throw fail('INSPECTION_CAPACITY', 413);
      chunks.push(buffer);
    }
  } catch (error) {
    stream.destroy?.();
    throw error;
  }
  return Buffer.concat(chunks, size);
}
export function driveMaintenanceJournal(storage) {
  const valid = file =>
    !!file?.id &&
    file.name === name &&
    file.mimeType === 'application/json' &&
    !file.trashed &&
    file.parents?.includes(storage.rootFolderId) &&
    file.appProperties?.[marker] === '1' &&
    Number(file.size) > 0 &&
    Number(file.size) <= MAX;
  async function find(signal) {
    if (!storage.rootFolderId) throw fail(); // Never bootstrap storage from an inspection.
    const result = await storage.client.files.list(
      {
        q: `'${quote(storage.rootFolderId)}' in parents and trashed = false and name = '${name}'`,
        fields: 'nextPageToken,files(id,name,size,mimeType,parents,trashed,appProperties)',
        pageSize: 2,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      },
      { signal },
    );
    if (result.data.nextPageToken || result.data.files?.length > 1) throw fail('INSPECTION_AMBIGUOUS');
    const file = result.data.files?.[0];
    if (file && !valid(file)) throw fail();
    return file;
  }
  async function read() {
    const signal = AbortSignal.timeout(20000),
      file = await find(signal);
    if (!file) return { payload: null, token: null };
    if (!storage.versionClient) throw fail('STORAGE_VERSION_MISSING');
    const version = (await storage.versionClient.files.get({ fileId: file.id, fields: 'etag,md5Checksum', supportsAllDrives: true }, { signal })).data;
    if (!version.etag || !version.md5Checksum) throw fail('STORAGE_VERSION_MISSING');
    const response = await storage.client.files.get({ fileId: file.id, alt: 'media', supportsAllDrives: true }, { responseType: 'stream', signal });
    const buffer = await bounded(response.data, signal);
    if (buffer.length !== Number(file.size) || createHash('md5').update(buffer).digest('hex') !== version.md5Checksum) throw conflict();
    const payload = decode(new TextDecoder('utf-8', { fatal: true }).decode(buffer));
    return { payload, token: { id: file.id, etag: version.etag } };
  }
  return {
    read,
    async save(payload, expected) {
      const text = encode(payload),
        signal = AbortSignal.timeout(20000),
        file = await find(signal);
      const media = { mimeType: 'application/json', body: Readable.from([text]) };
      if (expected) {
        if (!file || file.id !== expected.id || !expected.etag) throw conflict();
        try {
          await storage.updateVersionedJson({ fileId: file.id, media, supportsAllDrives: true }, { headers: { 'If-Match': expected.etag }, signal });
        } catch (error) {
          if ([409, 412].includes(Number(error.code || error.status || error.response?.status))) throw conflict();
          throw error;
        }
      } else {
        if (file) throw conflict();
        await storage.client.files.create(
          { requestBody: { name, parents: [storage.rootFolderId], appProperties: { [marker]: '1' } }, media, fields: 'id', supportsAllDrives: true },
          { signal },
        );
      }
      // Re-read before the next step; never invent a new ETag from a write.
      return { payload, token: null };
    },
  };
}

export const maintenanceJournal = storage => (storage.name === 'google-drive' ? driveMaintenanceJournal(storage) : localMaintenanceJournal(storage));
