import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { cacheSearchValue, cachedSearchValue } from '../knowledge-search-cache.js';

export const KNOWLEDGE_METADATA_MAX_BYTES = 16 * 1024 * 1024;
export const KNOWLEDGE_METADATA_WORKSPACE_BYTES = 64 * 1024 * 1024;
const TARGET = 512 * 1024;
const collections = ['knowledgeNotes', 'knowledgeFolders', '_knowledgeImports'];
const fields = [...collections, '_knowledgeSearch'];
const digest = text => createHash('sha256').update(text).digest('hex');
const bucket = id => digest(id);
export const knowledgeMetadataError = () =>
  Object.assign(new Error('The knowledge metadata catalog is incomplete or corrupt.'), { code: 'KNOWLEDGE_METADATA_INTEGRITY', statusCode: 503 });
export const knowledgeMetadataFields = fields;
function boundedRoot(root) {
  if (Buffer.byteLength(JSON.stringify(root)) > 4 * 1024 * 1024)
    throw Object.assign(new Error('The workspace root exceeds its storage limit.'), { code: 'WORKSPACE_TOO_LARGE', statusCode: 413 });
  return root;
}
function validate(root) {
  const catalog = root?._knowledgeCatalog;
  if (
    !catalog ||
    catalog.version !== 1 ||
    !catalog.fields ||
    typeof catalog.fields !== 'object' ||
    Array.isArray(catalog.fields) ||
    !Object.hasOwn(catalog.fields, 'knowledgeNotes') ||
    !Object.hasOwn(catalog.fields, 'knowledgeFolders') ||
    Object.keys(catalog.fields).some(f => !fields.includes(f))
  )
    throw knowledgeMetadataError();
  for (const [field, parts] of Object.entries(catalog.fields)) {
    if (!Array.isArray(parts) || parts.length > 4096) throw knowledgeMetadataError();
    const prefixes = [];
    for (const p of parts) {
      if (
        !p ||
        !/^[a-f0-9]{1,6}$/.test(p.prefix) ||
        !/^[a-f0-9]{64}$/.test(p.sha256) ||
        !Number.isSafeInteger(p.bytes) ||
        p.bytes < 1 ||
        p.bytes > KNOWLEDGE_METADATA_MAX_BYTES ||
        !Number.isSafeInteger(p.count) ||
        p.count < 1
      )
        throw knowledgeMetadataError();
      prefixes.push(p.prefix);
    }
    prefixes.sort();
    if (prefixes.some((p, i) => i && p.startsWith(prefixes[i - 1]))) throw knowledgeMetadataError();
    if (collections.includes(field)) {
      const identities = root[field];
      if (
        !Array.isArray(identities) ||
        identities.some(row => !row || typeof row.id !== 'string' || !row.id || row.id.length > 180) ||
        new Set(identities.map(r => r.id)).size !== identities.length ||
        parts.reduce((n, p) => n + p.count, 0) !== identities.length
      )
        throw knowledgeMetadataError();
    }
  }
  return catalog;
}
async function readPart(storage, field, part) {
  const key = 'knowledge-meta:' + field + ':' + part.sha256;
  const cached = cachedSearchValue(storage, key);
  if (cached) return cached;
  let text;
  try {
    text = await storage.readKnowledgeMetadata(part.sha256);
  } catch {
    throw knowledgeMetadataError();
  }
  if (typeof text !== 'string' || Buffer.byteLength(text) !== part.bytes || digest(text) !== part.sha256) throw knowledgeMetadataError();
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw knowledgeMetadataError();
  }
  if (
    value.format !== 'smena-knowledge-metadata-v1' ||
    value.field !== field ||
    value.prefix !== part.prefix ||
    !Array.isArray(value.rows) ||
    value.rows.length !== part.count
  )
    throw knowledgeMetadataError();
  const rows = new Map();
  for (const row of value.rows) {
    if (
      !Array.isArray(row) ||
      row.length !== 2 ||
      typeof row[0] !== 'string' ||
      !bucket(row[0]).startsWith(part.prefix) ||
      rows.has(row[0]) ||
      !row[1] ||
      typeof row[1] !== 'object' ||
      Array.isArray(row[1]) ||
      (collections.includes(field) && row[1].id !== row[0])
    )
      throw knowledgeMetadataError();
    rows.set(row[0], row[1]);
  }
  cacheSearchValue(storage, key, rows, part.bytes * 2);
  return rows;
}
// Logical schema stays v3. Raw v4 roots make older deployments fail closed
// instead of interpreting identity rows as complete, editable notes.
export async function materializeKnowledgeMetadata(root, storage, { knowledge = true, ids, fields: requestedFields, authorize } = {}) {
  if (root && authorize) await authorize(root);
  if (!root?._knowledgeCatalog) {
    if (root?.schemaVersion === 4) throw knowledgeMetadataError();
    return root;
  }
  const catalog = validate(root),
    result = { ...root, schemaVersion: 3 };
  delete result._knowledgeMetadataPending;
  if (!knowledge) return { ...result, _knowledgeMetadataPending: true };
  for (const [field, parts] of Object.entries(catalog.fields)) {
    if (requestedFields && !requestedFields.includes(field)) continue;
    const rows = new Map(),
      selected = field === 'knowledgeNotes' && ids ? new Set(ids) : null;
    const pending = parts.filter(part => !selected || [...selected].some(id => bucket(id).startsWith(part.prefix)));
    await Promise.all(
      Array.from({ length: Math.min(8, pending.length) }, async () => {
        while (pending.length) {
          const part = pending.shift();
          for (const [id, value] of await readPart(storage, field, part)) if (!selected || selected.has(id)) rows.set(id, structuredClone(value));
        }
      }),
    );
    if (collections.includes(field)) {
      const order = root[field].filter(row => !selected || selected.has(row.id));
      if (rows.size !== order.length || order.some(row => !rows.has(row.id))) throw knowledgeMetadataError();
      result[field] = order.map(row => rows.get(row.id));
    } else {
      if (rows.size !== 1 || !rows.has('search')) throw knowledgeMetadataError();
      result[field] = rows.get('search');
    }
  }
  if (ids || (requestedFields && Object.keys(catalog.fields).some(field => !requestedFields.includes(field)))) result._knowledgeMetadataPending = true;
  return result;
}
async function writeField(storage, field, rows, oldParts) {
  const parts = [],
    reusable = new Map((oldParts || []).map(p => [p.sha256, p]));
  const write = async (prefix, items) => {
    if (!items.length) return;
    items.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    const text = JSON.stringify({ format: 'smena-knowledge-metadata-v1', field, prefix, rows: items }),
      bytes = Buffer.byteLength(text);
    if ((bytes > TARGET || items.length > 500) && items.length > 1 && prefix.length < 6) {
      for (const hex of '0123456789abcdef')
        await write(
          prefix + hex,
          items.filter(row => bucket(row[0]).startsWith(prefix + hex)),
        );
      return;
    }
    if (bytes > KNOWLEDGE_METADATA_MAX_BYTES) throw knowledgeMetadataError();
    const sha256 = digest(text),
      part = { prefix, sha256, bytes, count: items.length };
    if (!reusable.has(sha256)) await storage.writeKnowledgeMetadata(text, sha256);
    parts.push(part);
  };
  for (const hex of '0123456789abcdef')
    await write(
      hex,
      rows.filter(row => bucket(row[0]).startsWith(hex)),
    );
  return parts;
}
export async function stageKnowledgeMetadata(data, storage, previous, { unchangedKnowledge = false } = {}) {
  const enabled = process.env.KNOWLEDGE_METADATA_SHARDS_ENABLED === 'true' && process.env.KNOWLEDGE_CATALOG_ENABLED === 'true';
  if (!enabled && !data._knowledgeCatalog) return data;
  const result = { ...data };
  delete result._knowledgeMetadataPending;
  if (data._knowledgeMetadataPending) {
    if (
      !previous?._knowledgeCatalog ||
      !isDeepStrictEqual(data._knowledgeCatalog, previous._knowledgeCatalog) ||
      fields.some(field => !isDeepStrictEqual(data[field], previous[field]))
    )
      throw knowledgeMetadataError();
    validate(result);
    return boundedRoot({ ...result, schemaVersion: 4 });
  }
  const before = previous?._knowledgeCatalog && validate(previous),
    catalog = { version: 1, fields: {} };
  for (const field of fields) {
    const value = data[field];
    if (value === undefined) {
      delete result[field];
      continue;
    }
    if (
      collections.includes(field) &&
      (!Array.isArray(value) ||
        value.some(row => typeof row?.id !== 'string' || !row.id || row.id.length > 180) ||
        new Set(value.map(row => row.id)).size !== value.length)
    )
      throw knowledgeMetadataError();
    if (before?.fields[field] && (unchangedKnowledge || isDeepStrictEqual(value, previous[field]))) catalog.fields[field] = before.fields[field];
    else
      catalog.fields[field] = await writeField(
        storage,
        field,
        collections.includes(field) ? value.map(row => [row.id, row]) : [['search', value]],
        before?.fields[field],
      );
    if (collections.includes(field)) result[field] = value.map(row => ({ id: row.id }));
    else delete result[field];
  }
  result._knowledgeCatalog = catalog;
  result.schemaVersion = 4;
  validate(result);
  return boundedRoot(result);
}
