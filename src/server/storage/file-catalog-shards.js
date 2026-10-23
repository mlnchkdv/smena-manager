import { createHash } from 'node:crypto';

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
  data.files.forEach((file, index) => {
    const project = file.project || '';
    if (!groups.has(project)) groups.set(project, []);
    groups.get(project).push([index, file]);
  });
  const reusable = new Map((previous?.shards || []).map(part => [part.sha256, part]));
  const shards = [];
  for (const [project, rows] of groups) {
    let batch = [];
    let bytes = 2;
    const flush = async () => {
      if (!batch.length) return;
      const text = JSON.stringify(batch),
        sha256 = digest(text);
      const old = reusable.get(sha256);
      const id = old?.project === project ? old.id : await write(text, sha256);
      if (typeof id !== 'string' || !id) throw invalid();
      shards.push({ id, project, sha256, bytes: Buffer.byteLength(text), count: batch.length });
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
  return { ...core, _fileCatalog: { version: 1, total: data.files.length, shards } };
}

export function validateCatalogManifest(manifest) {
  if (
    !manifest ||
    manifest.version !== 1 ||
    !Number.isSafeInteger(manifest.total) ||
    manifest.total < 0 ||
    manifest.total > MAX_FILES ||
    !Array.isArray(manifest.shards) ||
    manifest.shards.length > MAX_FILES
  )
    throw invalid();
  let count = 0;
  const ids = new Set();
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
    count += part.count;
  }
  if (count !== manifest.total) throw invalid();
  return manifest;
}

export async function readCatalogShards(root, read, project) {
  const manifest = validateCatalogManifest(root._fileCatalog);
  if (Object.hasOwn(root, 'files')) throw invalid();
  const rows = [],
    ids = new Set(),
    positions = new Set();
  for (const part of manifest.shards) {
    if (project !== undefined && part.project !== project) continue;
    const text = await read(part.id);
    if (typeof text !== 'string' || Buffer.byteLength(text) !== part.bytes || digest(text) !== part.sha256) throw invalid();
    let batch;
    try {
      batch = JSON.parse(text);
    } catch {
      throw invalid();
    }
    if (!Array.isArray(batch) || batch.length !== part.count) throw invalid();
    for (const row of batch) {
      if (!Array.isArray(row) || row.length !== 2) throw invalid();
      const [index, file] = row;
      if (
        !Number.isSafeInteger(index) ||
        index < 0 ||
        index >= manifest.total ||
        positions.has(index) ||
        !file ||
        typeof file.id !== 'string' ||
        ids.has(file.id) ||
        (file.project || '') !== part.project
      )
        throw invalid();
      positions.add(index);
      ids.add(file.id);
      rows.push(row);
    }
  }
  rows.sort((a, b) => a[0] - b[0]);
  return rows.map(row => row[1]);
}

export async function materializeCatalog(root, read) {
  if (!root?._fileCatalog) return root;
  const files = await readCatalogShards(root, read);
  const { _fileCatalog: _manifest, ...core } = root;
  void _manifest;
  return { ...core, files };
}
