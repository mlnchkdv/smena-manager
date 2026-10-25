import { isDeepStrictEqual as same } from 'node:util';
import { catalogCore, writeCatalogShards, validateCatalogManifest } from './file-catalog-shards.js';
import { readCatalogReferences, referenceAccounting } from './catalog-references.js';
import { readCatalogAccounting } from '../file-catalog-accounting.js';
import { physicalFileKey } from '../file-registry.js';
import { FILE_CATALOG_MAX_BYTES } from '../../shared/file-catalog.js';

const allowed = new Set(['files', 'tasks', 'trash', '_fileRegistry', '_pendingUploads', '_fileGc', 'revision', 'updatedAt']);
const fixed = data => Object.fromEntries(Object.entries(data).filter(([key]) => !allowed.has(key)));
const invalid = () => Object.assign(new Error('Invalid scoped catalog delta.'), { code: 'FILE_PATCH_FORBIDDEN', statusCode: 403 });

// Internal server commands only. Existing records must remain byte-equivalent;
// physical insertion values come from verified uploads, never client snapshots.
export async function writeCatalogDelta(root, before, next, write) {
  const refs = readCatalogReferences(root);
  const core = catalogCore(root);
  if (!refs || !same(fixed(core), fixed(next)) || next.revision !== root.revision + 1 || !Number.isFinite(Date.parse(next.updatedAt))) throw invalid();
  const previous = new Map(before.map(file => [file.id, file])),
    remaining = new Map(next.files.map(file => [file.id, file]));
  if (remaining.size !== next.files.length || previous.size !== before.length) throw invalid();
  const keys = new Map(root._fileCatalog.shards.flatMap(part => part.keys.map(key => [key[0], key[4]])));
  const selected = root._fileCatalog.shards.filter(part => part.keys.some(([id]) => previous.has(id)));
  if (selected.flatMap(part => part.keys).length !== previous.size || before.some(file => !keys.has(file.id))) throw invalid();
  const removed = before.filter(file => !remaining.has(file.id)),
    added = next.files.filter(file => !previous.has(file.id));
  if (
    added.some(file => keys.has(file.id)) ||
    added.length + removed.length > 500 ||
    next.files.some(file => previous.has(file.id) && !same(file, previous.get(file.id)))
  )
    throw invalid();
  const total = root._fileCatalog.total + added.length - removed.length;
  if (total < 0 || total > 100000) throw invalid();
  const old = readCatalogAccounting(root),
    logical = { ...old.fileStorage.logical, files: total };
  let bytes =
    old.catalogBytes + Math.max(0, total - 1) - Math.max(0, root._fileCatalog.total - 1) + String(next.revision).length - String(root.revision).length;
  for (const [files, sign] of [
    [removed, -1],
    [added, 1],
  ])
    for (const file of files) {
      bytes += sign * Buffer.byteLength(JSON.stringify(file));
      if (Number.isFinite(file.bytes) && file.bytes >= 0) logical.knownBytes += sign * file.bytes;
      else logical.unknownFiles += sign;
      const key = physicalFileKey(file);
      if (key) {
        const count = (refs.get(key) || 0) + sign;
        if (count < 0) throw invalid();
        if (count) refs.set(key, count);
        else refs.delete(key);
      }
    }
  if (bytes > FILE_CATALOG_MAX_BYTES)
    throw Object.assign(new Error('File catalog exceeds its synchronization limit.'), {
      statusCode: 413,
      code: 'WORKSPACE_TOO_LARGE',
      actualBytes: bytes,
      maxBytes: FILE_CATALOG_MAX_BYTES,
    });
  const positions = new Map();
  let ordinal = added.length;
  const removedIds = new Set(removed.map(file => file.id));
  for (const [id] of [...keys].sort((a, b) => a[1] - b[1])) if (!removedIds.has(id)) positions.set(id, ordinal++);
  added.forEach((file, index) => positions.set(file.id, index));
  const shards = [];
  const pending = new Set(added);
  for (const part of root._fileCatalog.shards) {
    if (!part.keys.some(([id]) => previous.has(id))) {
      shards.push({ ...part, keys: part.keys.map(key => [...key.slice(0, 4), positions.get(key[0])]) });
      continue;
    }
    const files = part.keys.map(([id]) => remaining.get(id)).filter(Boolean);
    for (const file of pending)
      if (file.project === part.project) {
        files.push(file);
        pending.delete(file);
      }
    const replacement = await writeCatalogShards({ files }, { shards: [part] }, write);
    for (const part of replacement._fileCatalog.shards) shards.push({ ...part, keys: part.keys.map(key => [...key.slice(0, 4), positions.get(key[0])]) });
  }
  if (pending.size) {
    const inserted = await writeCatalogShards({ files: [...pending] }, null, write);
    for (const part of inserted._fileCatalog.shards) shards.push({ ...part, keys: part.keys.map(key => [...key.slice(0, 4), positions.get(key[0])]) });
  }
  const { files: _files, ...data } = next;
  void _files;
  const manifest = {
    version: 3,
    total,
    shards,
    physicalReferences: { version: 1, entries: [...refs] },
    accounting: { version: 1, revision: next.revision, catalogBytes: bytes, fileStorage: referenceAccounting(data, refs, logical) },
  };
  validateCatalogManifest(manifest);
  return { ...data, _fileCatalog: manifest };
}
