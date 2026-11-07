import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { addAbortSignal } from 'node:stream';
import { BACKUP_OBJECT_MAX_BYTES } from '../prepared-workspace-backup.js';

const scopes = Object.freeze({
  body: ['knowledge-bodies', 'smena-knowledge-body-', 'smenaKnowledgeBody'],
  version: ['knowledge-versions', 'smena-knowledge-version-', 'smenaKnowledgeVersion'],
  search: ['knowledge-search', 'smena-knowledge-search-', 'smenaKnowledgeSearch'],
  metadata: ['knowledge-metadata', 'smena-knowledge-metadata-', 'smenaKnowledgeMetadata'],
  backup: ['objects', 'smena-backup-object-', 'smenaBackupObject'],
});
const hash = value => createHash('sha256').update(value).digest('hex');
const fail = (code = 'KNOWLEDGE_INVENTORY_INTEGRITY') => Object.assign(new Error('Knowledge inventory could not be verified.'), { code, statusCode: 503 });
const quote = value => String(value).replaceAll('\\', '\\\\').replaceAll("'", "\\'");
const validScope = scope => {
  if (!Object.hasOwn(scopes, scope)) throw fail();
  return scopes[scope];
};
const bounds = limit => {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw fail();
  return limit;
};
const cursorFor = (cursor, provider, scope, parent) => {
  if (cursor == null) return null;
  if (cursor.format !== 'smena-knowledge-inventory-v1' || cursor.provider !== provider || cursor.scope !== scope || cursor.parent !== parent) throw fail();
  return cursor;
};
const nextCursor = (provider, scope, parent, rest) => ({ format: 'smena-knowledge-inventory-v1', provider, scope, parent, ...rest });
const unknown = (scope, id) => ({ id: `unknown:${hash(String(id))}`, scope, owned: false });
function object(scope, id, sha256, bytes, createdAt) {
  if (!/^[a-f0-9]{64}$/.test(sha256 || '') || !Number.isSafeInteger(bytes) || bytes < 1 || bytes > BACKUP_OBJECT_MAX_BYTES) return unknown(scope, id);
  // A namespace/name match is not a successful format or integrity check.
  return { scope, area: scope === 'backup' ? 'backup' : 'live', kind: scope, id, sha256, bytes, createdAt, owned: true };
}
function verified(buffer, expected) {
  if (!expected?.owned || buffer.length !== expected.bytes || hash(buffer) !== expected.sha256) throw fail();
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer);
    JSON.parse(text);
  } catch {
    throw fail();
  }
  return { text, integrityChecked: true };
}
async function bounded(stream, signal) {
  const chunks = [];
  let bytes = 0;
  if (signal) addAbortSignal(signal, stream);
  for await (const chunk of stream) {
    signal?.throwIfAborted();
    const value = Buffer.from(chunk);
    bytes += value.length;
    if (bytes > BACKUP_OBJECT_MAX_BYTES) {
      stream.destroy();
      throw fail();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks, bytes);
}
const stamp = stat => `${stat.dev}:${stat.ino}:${stat.mtimeMs}:${stat.ctimeMs}`;
async function localDirectory(storage, scope) {
  const [folder] = validScope(scope),
    base = scope === 'backup' ? storage.backupsPath : path.dirname(storage.databasePath),
    directory = path.join(base, folder);
  try {
    if ((await fs.lstat(base)).isSymbolicLink()) throw fail();
    const stat = await fs.lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw fail();
    const relative = path.relative(await fs.realpath(base), await fs.realpath(directory));
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw fail();
    return { directory, stamp: stamp(stat), parent: hash(directory) };
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}
export function localKnowledgeInventory(storage) {
  return {
    async listKnowledgeObjectInventory({ scope, cursor = null, limit = 100, signal } = {}) {
      bounds(limit);
      signal?.throwIfAborted();
      const location = await localDirectory(storage, scope);
      if (!location) {
        if (cursor) throw fail('KNOWLEDGE_INVENTORY_CHANGED');
        return { items: [], cursor: null };
      }
      const previous = cursorFor(cursor, 'local', scope, location.parent),
        after = previous?.after || '';
      if (previous && (previous.stamp !== location.stamp || typeof after !== 'string' || after.length > 255)) throw fail('KNOWLEDGE_INVENTORY_CHANGED');
      // Keep only one page plus a lookahead in memory, even in a large directory.
      const names = [];
      let visited = 0;
      for await (const entry of await fs.opendir(location.directory)) {
        signal?.throwIfAborted();
        if (++visited > 1000000) throw fail('KNOWLEDGE_INVENTORY_LIMIT');
        if (entry.name <= after) continue;
        names.push(entry.name);
        names.sort();
        if (names.length > limit + 1) names.pop();
      }
      const items = [];
      for (const name of names.slice(0, limit)) {
        const match = /^([a-f0-9]{64})\.json$/.exec(name),
          stat = await fs.lstat(path.join(location.directory, name));
        items.push(
          match && stat.isFile() && !stat.isSymbolicLink()
            ? object(scope, `${scope}:${match[1]}`, match[1], stat.size, stat.birthtime.toISOString())
            : unknown(scope, name),
        );
      }
      if ((await localDirectory(storage, scope))?.stamp !== location.stamp) throw fail('KNOWLEDGE_INVENTORY_CHANGED');
      return { items, cursor: names.length > limit ? nextCursor('local', scope, location.parent, { after: names[limit - 1], stamp: location.stamp }) : null };
    },
    async readKnowledgeInventoryObject(expected, { signal } = {}) {
      const scope = expected?.scope;
      validScope(scope);
      if (expected.id !== `${scope}:${expected.sha256}` || !object(scope, expected.id, expected.sha256, expected.bytes).owned) throw fail();
      signal?.throwIfAborted();
      const location = await localDirectory(storage, scope);
      if (!location) throw fail();
      const target = path.join(location.directory, expected.sha256 + '.json'),
        before = await fs.lstat(target);
      if (!before.isFile() || before.isSymbolicLink() || before.size !== expected.bytes) throw fail();
      const handle = await fs.open(target, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
      try {
        const opened = await handle.stat();
        if (opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size) throw fail();
        return verified(await bounded(handle.createReadStream({ autoClose: false }), signal), expected);
      } finally {
        await handle.close();
      }
    },
  };
}
async function driveParent(storage, scope, signal) {
  validScope(scope);
  signal?.throwIfAborted();
  if (!storage.client?.files || !storage.rootFolderId) throw fail('KNOWLEDGE_INVENTORY_NOT_INITIALIZED');
  if (scope !== 'backup') return storage.rootFolderId;
  // Read-only inspection never creates a missing backup folder or initializes Drive.
  const result = await storage.client.files.list(
    {
      q: `'${quote(storage.rootFolderId)}' in parents and trashed = false and name = 'backups' and mimeType = 'application/vnd.google-apps.folder'`,
      fields: 'nextPageToken,files(id,name,mimeType,parents,trashed)',
      pageSize: 2,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    },
    { signal },
  );
  const rows = result.data.files || [];
  if (result.data.nextPageToken || rows.length > 1) throw fail();
  const folder = rows[0];
  if (!folder) return null;
  if (
    folder.name !== 'backups' ||
    folder.mimeType !== 'application/vnd.google-apps.folder' ||
    folder.trashed ||
    !folder.parents?.includes(storage.rootFolderId)
  )
    throw fail();
  return folder.id;
}
const driveFields = 'id,name,size,createdTime,mimeType,parents,trashed,appProperties';
function driveObject(file, scope, parent) {
  const [, prefix, marker] = validScope(scope),
    name = String(file?.name || ''),
    sha256 = name.slice(prefix.length, -5);
  if (
    !file?.id ||
    typeof file.id !== 'string' ||
    file.id.length > 256 ||
    file.trashed ||
    file.mimeType !== 'application/json' ||
    !file.parents?.includes(parent) ||
    file.appProperties?.[marker] !== '1' ||
    name !== `${prefix}${sha256}.json`
  )
    return unknown(scope, file?.id);
  return object(scope, file.id, sha256, Number(file.size), file.createdTime);
}
export function driveKnowledgeInventory(storage) {
  return {
    async listKnowledgeObjectInventory({ scope, cursor = null, limit = 100, signal } = {}) {
      bounds(limit);
      const [, , marker] = validScope(scope),
        combined = AbortSignal.any([AbortSignal.timeout(15000), ...(signal ? [signal] : [])]),
        parent = await driveParent(storage, scope, combined);
      if (!parent) {
        if (cursor) throw fail('KNOWLEDGE_INVENTORY_CHANGED');
        return { items: [], cursor: null };
      }
      const previous = cursorFor(cursor, 'drive', scope, parent),
        token = previous?.pageToken;
      if (previous && (typeof token !== 'string' || !token || token.length > 32768)) throw fail();
      const result = await storage.client.files.list(
        {
          q: `'${quote(parent)}' in parents and trashed = false and appProperties has { key='${marker}' and value='1' }`,
          fields: `nextPageToken,files(${driveFields})`,
          pageSize: limit,
          ...(token ? { pageToken: token } : {}),
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
        },
        { signal: combined },
      );
      if (
        !Array.isArray(result.data.files) ||
        result.data.files.length > limit ||
        (result.data.nextPageToken &&
          (typeof result.data.nextPageToken !== 'string' || result.data.nextPageToken.length > 32768 || result.data.nextPageToken === token))
      )
        throw fail();
      return {
        items: result.data.files.map(file => driveObject(file, scope, parent)),
        cursor: result.data.nextPageToken ? nextCursor('drive', scope, parent, { pageToken: result.data.nextPageToken }) : null,
      };
    },
    async readKnowledgeInventoryObject(expected, { signal } = {}) {
      validScope(expected?.scope);
      if (
        !expected.owned ||
        typeof expected.id !== 'string' ||
        !/^[\w-]{1,256}$/.test(expected.id) ||
        !object(expected.scope, expected.id, expected.sha256, expected.bytes).owned
      )
        throw fail();
      const combined = AbortSignal.any([AbortSignal.timeout(15000), ...(signal ? [signal] : [])]),
        parent = await driveParent(storage, expected.scope, combined);
      if (!parent) throw fail();
      const metadata = await storage.client.files.get({ fileId: expected.id, fields: driveFields, supportsAllDrives: true }, { signal: combined }),
        fresh = driveObject(metadata.data, expected.scope, parent);
      if (!fresh.owned || fresh.id !== expected.id || fresh.sha256 !== expected.sha256 || fresh.bytes !== expected.bytes) throw fail();
      const result = await storage.client.files.get(
        { fileId: expected.id, alt: 'media', supportsAllDrives: true },
        { responseType: 'stream', signal: combined },
      );
      return verified(await bounded(result.data, combined), expected);
    },
  };
}
