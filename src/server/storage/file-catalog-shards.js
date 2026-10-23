import { createHash } from 'node:crypto';
import { fileCatalogIndex } from '../file-catalog-index.js';
import { createCatalogAccounting } from '../file-catalog-accounting.js';

export const CATALOG_SHARD_BYTES = 2 * 1024 * 1024;
const MAX_FILES = 100000;
const SHARD_RECORDS = 2000;
const digest = text => createHash('sha256').update(text).digest('hex');
const invalid = () => Object.assign(new Error('The stored file catalog is incomplete or corrupt.'), { code: 'FILE_CATALOG_CORRUPT', statusCode: 503 });

// Parts are immutable. Only the existing root JSON is conditionally replaced;
// an interrupted/losing writer cannot expose a half-written catalog.
export async function writeCatalogShards(data, previous, write) {
  if (!Array.isArray(data.files) || data.files.length > MAX_FILES) throw invalid();
  const groups = new Map();
  const order = new Map();
  data.files.forEach((file, index) => {
    if (typeof file.id !== 'string' || !file.id || order.has(file.id)) throw invalid();
    order.set(file.id, index);
    const project = file.project || '';
    if (!groups.has(project)) groups.set(project, []);
    groups.get(project).push([file.id, file]);
  });
  const reusable = new Map((previous?.shards || []).map(part => [part.sha256, part]));
  const reusableSearch = new Map(
    (previous?.shards || []).filter(part => part.search?.version === 1).map(part => [`${part.project}:${part.search.sha256}`, part.search]),
  );
  const shards = [];
  for (const [project, rows] of groups) {
    // Global ordering belongs to the root manifest, not immutable part content.
    // Inserting a file must not rewrite every unrelated project's parts.
    rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    let batch = [];
    let bytes = 2;
    const flush = async () => {
      if (!batch.length) return;
      const text = JSON.stringify(batch),
        sha256 = digest(text);
      const old = reusable.get(sha256);
      const id = old?.project === project ? old.id : await write(text, sha256);
      if (typeof id !== 'string' || !id) throw invalid();
      const index = batch.map(([identity, file]) => [identity, fileCatalogIndex(file)]);
      // When full rows already contain only search fields, share their immutable
      // bytes instead of uploading a duplicate. Otherwise omit history/storage.
      const searchText = batch.every(([, file], i) => Object.keys(file).length === Object.keys(index[i][1]).length) ? text : JSON.stringify(index);
      const searchHash = digest(searchText);
      const searchId = searchText === text ? id : reusableSearch.get(`${project}:${searchHash}`)?.id || (await write(searchText, searchHash));
      if (typeof searchId !== 'string' || !searchId) throw invalid();
      shards.push({
        id,
        project,
        sha256,
        bytes: Buffer.byteLength(text),
        count: batch.length,
        search: { version: 1, id: searchId, sha256: searchHash, bytes: Buffer.byteLength(searchText) },
        keys: batch.map(([, file]) => [file.id, file.folderId || '', Math.max(0, Number(file.bytes) || 0), file.task || '', order.get(file.id)]),
      });
      batch = [];
      bytes = 2;
    };
    for (const row of rows) {
      const size = Buffer.byteLength(JSON.stringify(row));
      if (size + 2 > CATALOG_SHARD_BYTES) throw invalid();
      if (batch.length >= SHARD_RECORDS || bytes + size + 1 > CATALOG_SHARD_BYTES) await flush();
      batch.push(row);
      bytes += size + 1;
    }
    await flush();
  }
  const { files: _files, _fileCatalog: _catalog, ...core } = data;
  void _files;
  void _catalog;
  return { ...core, _fileCatalog: { version: 3, total: data.files.length, shards, accounting: createCatalogAccounting(data) } };
}

export function validateCatalogManifest(manifest) {
  if (
    !manifest ||
    ![1, 2, 3].includes(manifest.version) ||
    !Number.isSafeInteger(manifest.total) ||
    manifest.total < 0 ||
    manifest.total > MAX_FILES ||
    !Array.isArray(manifest.shards) ||
    manifest.shards.length > MAX_FILES
  )
    throw invalid();
  let count = 0;
  const ids = new Set();
  const fileIds = new Set();
  const positions = new Set();
  for (const part of manifest.shards) {
    if (
      !part ||
      typeof part.id !== 'string' ||
      !part.id ||
      ids.has(part.id) ||
      typeof part.project !== 'string' ||
      !/^[a-f0-9]{64}$/.test(part.sha256) ||
      !Number.isSafeInteger(part.bytes) ||
      part.bytes < 2 ||
      part.bytes > CATALOG_SHARD_BYTES ||
      !Number.isSafeInteger(part.count) ||
      part.count < 1 ||
      part.count > SHARD_RECORDS
    )
      throw invalid();
    ids.add(part.id);
    if (part.search !== undefined) {
      const search = part.search;
      if (
        manifest.version !== 3 ||
        !search ||
        search.version !== 1 ||
        typeof search.id !== 'string' ||
        !search.id ||
        !/^[a-f0-9]{64}$/.test(search.sha256) ||
        !Number.isSafeInteger(search.bytes) ||
        search.bytes < 2 ||
        search.bytes > CATALOG_SHARD_BYTES ||
        (search.id === part.id ? search.sha256 !== part.sha256 || search.bytes !== part.bytes : ids.has(search.id))
      )
        throw invalid();
      ids.add(search.id);
    }
    if (manifest.version >= 2) {
      if (!Array.isArray(part.keys) || part.keys.length !== part.count) throw invalid();
      for (const key of part.keys) {
        if (
          !Array.isArray(key) ||
          key.length !== (manifest.version === 3 ? 5 : 4) ||
          typeof key[0] !== 'string' ||
          !key[0] ||
          fileIds.has(key[0]) ||
          typeof key[1] !== 'string' ||
          !Number.isFinite(key[2]) ||
          key[2] < 0 ||
          typeof key[3] !== 'string'
        )
          throw invalid();
        fileIds.add(key[0]);
        if (manifest.version === 3) {
          if (!Number.isSafeInteger(key[4]) || key[4] < 0 || key[4] >= manifest.total || positions.has(key[4])) throw invalid();
          positions.add(key[4]);
        }
      }
    }
    count += part.count;
  }
  if (count !== manifest.total) throw invalid();
  return manifest;
}

export async function readCatalogShards(root, read, project, projectFile = file => file, search = false) {
  const manifest = validateCatalogManifest(root._fileCatalog);
  if (Object.hasOwn(root, 'files')) throw invalid();
  const rows = [],
    ids = new Set(),
    positions = new Set();
  for (const part of manifest.shards) {
    if (typeof project === 'string' && part.project !== project) continue;
    if (project?.projects && !project.projects.has(part.project)) continue;
    if (project?.ids && part.keys && !part.keys.some(key => project.ids.has(key[0]))) continue;
    const descriptor = search && part.search ? part.search : part;
    const text = await read(descriptor.id, descriptor);
    if (typeof text !== 'string' || Buffer.byteLength(text) !== descriptor.bytes || digest(text) !== descriptor.sha256) throw invalid();
    let batch;
    try {
      batch = JSON.parse(text);
    } catch {
      throw invalid();
    }
    if (!Array.isArray(batch) || batch.length !== part.count) throw invalid();
    for (const [ordinal, row] of batch.entries()) {
      if (!Array.isArray(row) || row.length !== 2) throw invalid();
      const [identity, file] = row;
      const key = part.keys?.[ordinal];
      const index = manifest.version === 3 ? key[4] : identity;
      if (
        !Number.isSafeInteger(index) ||
        index < 0 ||
        index >= manifest.total ||
        positions.has(index) ||
        !file ||
        typeof file.id !== 'string' ||
        (manifest.version === 3 && identity !== file.id) ||
        ids.has(file.id) ||
        (file.project || '') !== part.project
      )
        throw invalid();
      if (key && (key[0] !== file.id || key[1] !== (file.folderId || '') || key[2] !== Math.max(0, Number(file.bytes) || 0) || key[3] !== (file.task || '')))
        throw invalid();
      if (search && part.search && Object.keys(file).length !== Object.keys(fileCatalogIndex(file)).length) throw invalid();
      positions.add(index);
      ids.add(file.id);
      // Validate the original record before projecting it. Search/graph readers
      // retain only small index rows, not every file's history/storage metadata.
      rows.push([index, projectFile(file)]);
    }
  }
  rows.sort((a, b) => a[0] - b[0]);
  return rows.map(row => row[1]);
}

export function catalogCore(root) {
  const manifest = validateCatalogManifest(root._fileCatalog);
  if (manifest.version < 2 || Object.hasOwn(root, 'files')) throw invalid();
  const { _fileCatalog: _manifest, ...core } = root;
  void _manifest;
  return {
    ...core,
    files: manifest.shards.flatMap(part =>
      part.keys.map(([id, folderId, bytes, task]) => ({ id, project: part.project, folderId: folderId || undefined, bytes, task: task || undefined })),
    ),
  };
}

export async function materializeCatalog(root, read) {
  if (!root?._fileCatalog) return root;
  const files = await readCatalogShards(root, read);
  const { _fileCatalog: _manifest, ...core } = root;
  void _manifest;
  return { ...core, files };
}
