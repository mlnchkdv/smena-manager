import { isDeepStrictEqual as same } from 'node:util';
import { catalogCore, writeCatalogShards, validateCatalogManifest } from './file-catalog-shards.js';
import { metadataWriteBase } from './catalog-metadata-write.js';
import { readCatalogAccounting } from '../file-catalog-accounting.js';
import { FILE_CATALOG_MAX_BYTES } from '../../shared/file-catalog.js';
import { assertFileFolder } from '../../shared/file-organization.js';

const omit = (value, keys) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
const forbidden = () => Object.assign(new Error('This change requires a canonical catalog write.'), { statusCode: 403, code: 'FILE_PATCH_FORBIDDEN' });

export function fileMetadataChanges(before, after) {
  if (
    !before ||
    !after ||
    !same(
      omit(before, ['name', 'folderId', ...(!before.storageName && !before.storageFileId ? ['type'] : [])]),
      omit(after, ['name', 'folderId', ...(!before.storageName && !before.storageFileId ? ['type'] : [])]),
    )
  )
    return false;
  return typeof after.name === 'string' && !!after.name.trim() && after.name.length <= 255;
}

export function filePatchIds(changes) {
  if (
    !changes ||
    !Array.isArray(changes.upsert) ||
    !Array.isArray(changes.remove) ||
    changes.remove.length ||
    !changes.upsert.length ||
    changes.upsert.length > 500
  )
    return null;
  const ids = new Set(changes.upsert.map(file => file?.id));
  return ids.size === changes.upsert.length && [...ids].every(id => typeof id === 'string' && /^[\p{L}\p{N}_.:@+-]{1,180}$/u.test(id)) ? ids : null;
}

// Tasks can change only the folder pointer on attachments whose existing
// catalog record is being moved. The caller separately checks every other
// incoming core field and the latest actor/project permissions.
export function filePatchTasks(core, updates) {
  const current = new Map(core.files.map(file => [file.id, file]));
  const moved = new Map(updates.filter(file => (current.get(file.id)?.folderId || '') !== (file.folderId || '')).map(file => [file.id, file.folderId]));
  return core.tasks.map(task => ({
    ...task,
    attachments: task.attachments.map(file => (moved.has(file.id) ? { ...file, folderId: moved.get(file.id) } : file)),
  }));
}

export async function writeFileMetadataParts(root, before, after, tasks, revision, updatedAt, write) {
  if (!metadataWriteBase(root) || revision !== root.revision + 1 || !Number.isFinite(Date.parse(updatedAt)) || before.length !== after.length)
    throw forbidden();
  const oldRows = new Map(before.map(file => [file.id, file]));
  const changed = new Set();
  for (const file of after) {
    const old = oldRows.get(file.id);
    if (!fileMetadataChanges(old, file)) throw forbidden();
    assertFileFolder(
      root.projects.find(project => project.id === file.project),
      file.folderId,
    );
    if (!same(old, file)) changed.add(file.id);
  }
  if (new Set(after.map(file => file.id)).size !== oldRows.size || !same(tasks, filePatchTasks(catalogCore(root), after))) throw forbidden();
  const affected = root._fileCatalog.shards.filter(part => part.keys.some(([id]) => oldRows.has(id)));
  const expected = new Set(affected.flatMap(part => part.keys.map(([id]) => id)));
  if (expected.size !== oldRows.size || [...oldRows.keys()].some(id => !expected.has(id))) throw forbidden();
  const accounting = readCatalogAccounting(root);
  const catalogBytes =
    accounting.catalogBytes +
    after.reduce((n, file) => n + Buffer.byteLength(JSON.stringify(file)) - Buffer.byteLength(JSON.stringify(oldRows.get(file.id))), 0) +
    String(revision).length -
    String(root.revision).length;
  if (catalogBytes > FILE_CATALOG_MAX_BYTES)
    throw Object.assign(new Error('File catalog exceeds its synchronization limit.'), {
      code: 'WORKSPACE_TOO_LARGE',
      statusCode: 413,
      actualBytes: catalogBytes,
      maxBytes: FILE_CATALOG_MAX_BYTES,
    });
  const byId = new Map(after.map(file => [file.id, file]));
  const shards = [];
  for (const part of root._fileCatalog.shards) {
    if (!part.keys.some(([id]) => changed.has(id))) {
      shards.push(part);
      continue;
    }
    const positions = new Map(part.keys.map(key => [key[0], key[4]]));
    const replacement = await writeCatalogShards({ files: part.keys.map(([id]) => byId.get(id)) }, { shards: [part] }, write);
    for (const updated of replacement._fileCatalog.shards) {
      updated.keys = updated.keys.map(key => [...key.slice(0, 4), positions.get(key[0])]);
      shards.push(updated);
    }
  }
  const manifest = { ...root._fileCatalog, shards, accounting: { version: 1, ...accounting, revision, catalogBytes } };
  validateCatalogManifest(manifest);
  return { ...root, revision, updatedAt, tasks, _fileCatalog: manifest };
}
