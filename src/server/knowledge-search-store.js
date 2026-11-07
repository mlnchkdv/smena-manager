import { createHash } from 'node:crypto';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { loadKnowledgeBody } from './knowledge-body-store.js';
import { cachedSearchValue, cacheSearchValue } from './knowledge-search-cache.js';
import { writeKnowledgeDirectory } from './knowledge-search-directory.js';
import { knowledgeSearchError } from './knowledge-search-errors.js';
export { knowledgeSearchError } from './knowledge-search-errors.js';

export const SEARCH_OBJECT_MAX_BYTES = 16 * 1024 * 1024;
const targetBytes = 4 * 1024 * 1024;
const digest = value => createHash('sha256').update(value).digest('hex');
const bucket = id => digest(id);
const partCacheKey = part => 'part:' + digest(JSON.stringify([part.prefix, part.sha256, part.bytes, part.rawBytes, part.members]));
export function validSearchPart(part) {
  return (
    part &&
    /^[a-f0-9]{1,6}$/.test(part.prefix) &&
    /^[a-f0-9]{64}$/.test(part.sha256) &&
    Number.isSafeInteger(part.bytes) &&
    part.bytes > 0 &&
    part.bytes <= SEARCH_OBJECT_MAX_BYTES &&
    Number.isSafeInteger(part.rawBytes) &&
    part.rawBytes > 0 &&
    part.rawBytes <= SEARCH_OBJECT_MAX_BYTES &&
    Array.isArray(part.members) &&
    part.members.length <= 10000 &&
    part.members.every(row => Array.isArray(row) && typeof row[0] === 'string' && row[0].length <= 180 && /^[a-f0-9]{64}$/.test(row[1]))
  );
}
export function knowledgeSearchParts(data) {
  if (!data._knowledgeSearch) return [];
  const parts = data._knowledgeSearch.parts;
  if (
    data._knowledgeSearch.version !== 1 ||
    !Array.isArray(parts) ||
    parts.length > 4096 ||
    parts.some(part => !validSearchPart(part)) ||
    new Set(parts.map(p => p.prefix)).size !== parts.length
  )
    throw knowledgeSearchError();
  const prefixes = parts.map(p => p.prefix).sort();
  if (prefixes.some((p, i) => i && p.startsWith(prefixes[i - 1]))) throw knowledgeSearchError();
  return parts;
}
export const knowledgeSearchCovered = (note, parts) => parts.some(part => part.members.some(([id, hash]) => id === note.id && hash === note.bodyRef?.sha256));
export async function loadSearchPart(storage, part, { signal } = {}) {
  signal?.throwIfAborted();
  if (!validSearchPart(part)) throw knowledgeSearchError();
  const cached = cachedSearchValue(storage, partCacheKey(part));
  if (cached) return cached;
  const text = await storage.readKnowledgeSearch(part.sha256, { signal });
  signal?.throwIfAborted();
  if (typeof text !== 'string' || Buffer.byteLength(text) !== part.bytes || digest(text) !== part.sha256) throw knowledgeSearchError();
  try {
    const object = JSON.parse(text);
    if (object.format !== 'smena-knowledge-search-v1' || object.prefix !== part.prefix || object.rawBytes !== part.rawBytes || typeof object.data !== 'string')
      throw knowledgeSearchError();
    const raw = inflateRawSync(Buffer.from(object.data, 'base64'), { maxOutputLength: SEARCH_OBJECT_MAX_BYTES });
    if (raw.length !== part.rawBytes) throw knowledgeSearchError();
    const rows = JSON.parse(raw.toString('utf8'));
    if (
      !Array.isArray(rows) ||
      rows.length !== part.members.length ||
      rows.some(
        (row, i) =>
          !Array.isArray(row) ||
          row.length !== 3 ||
          row[0] !== part.members[i][0] ||
          row[1] !== part.members[i][1] ||
          typeof row[2] !== 'string' ||
          !bucket(row[0]).startsWith(part.prefix),
      )
    )
      throw knowledgeSearchError();
    const map = new Map(rows.map(row => [row[0], row]));
    if (map.size !== rows.length) throw knowledgeSearchError();
    cacheSearchValue(storage, partCacheKey(part), map, raw.length * 2);
    return map;
  } catch {
    throw knowledgeSearchError();
  }
}
async function storePart(storage, prefix, rows) {
  rows.sort((a, b) => a[0].localeCompare(b[0]));
  const raw = JSON.stringify(rows),
    bytes = Buffer.byteLength(raw);
  if (bytes > targetBytes && rows.length > 1 && prefix.length < 6) {
    const parts = [];
    for (const hex of '0123456789abcdef') {
      const selected = rows.filter(row => bucket(row[0]).startsWith(prefix + hex));
      if (selected.length) parts.push(...(await storePart(storage, prefix + hex, selected)));
    }
    return parts;
  }
  if (bytes > SEARCH_OBJECT_MAX_BYTES) throw knowledgeSearchError();
  const text = JSON.stringify({
    format: 'smena-knowledge-search-v1',
    prefix,
    rawBytes: bytes,
    data: deflateRawSync(Buffer.from(raw), { level: 1 }).toString('base64'),
  });
  if (Buffer.byteLength(text) > SEARCH_OBJECT_MAX_BYTES) throw knowledgeSearchError();
  const sha256 = digest(text);
  await storage.writeKnowledgeSearch(text, sha256);
  const part = { prefix, sha256, bytes: Buffer.byteLength(text), rawBytes: bytes, members: rows.map(row => row.slice(0, 2)) };
  cacheSearchValue(storage, partCacheKey(part), new Map(rows.map(row => [row[0], row])), bytes * 2);
  return [part];
}
// Publish immutable parts first, then let the canonical root CAS publish their
// pointers. A failed write never exposes an incomplete index or note body.
export async function stageKnowledgeSearch(next, previous, storage, { forceIds = [], reset = false } = {}) {
  if (reset) next._knowledgeSearch = { version: 1, parts: [] };
  const before = new Map((previous.knowledgeNotes || []).map(note => [note.id, note]));
  const after = new Map((next.knowledgeNotes || []).map(note => [note.id, note]));
  const requested = new Set([
    ...forceIds,
    ...[...after.values()]
      .filter(
        note =>
          note.bodyRef &&
          note.searchVersion === 1 &&
          (reset || before.get(note.id)?.bodyRef?.sha256 !== note.bodyRef.sha256 || before.get(note.id)?.searchVersion !== 1),
      )
      .map(note => note.id),
    ...[...before.keys()].filter(id => !after.has(id)),
  ]);
  if (!requested.size) return next;
  let parts = reset ? [] : knowledgeSearchParts(next);
  const priorIndex = reset ? null : { ...next._knowledgeSearch, parts: parts.slice() };
  const changed = [...requested].filter(id =>
    !after.has(id) ? parts.some(p => p.members.some(row => row[0] === id)) : after.get(id).bodyRef && !knowledgeSearchCovered(after.get(id), parts),
  );
  if (!changed.length) {
    if (parts.length && !next._knowledgeSearch.directory)
      next._knowledgeSearch.directory = await writeKnowledgeDirectory(storage, parts, priorIndex, part => loadSearchPart(storage, part));
    return next;
  }
  const groups = new Map();
  for (const id of changed) {
    const prefix = parts.find(part => bucket(id).startsWith(part.prefix))?.prefix || bucket(id)[0];
    if (!groups.has(prefix)) groups.set(prefix, []);
    groups.get(prefix).push(id);
  }
  for (const [prefix, ids] of groups) {
    const old = parts.find(part => part.prefix === prefix);
    const rows = old ? new Map(await loadSearchPart(storage, old)) : new Map();
    for (const id of ids) {
      const note = after.get(id);
      if (!note) {
        rows.delete(id);
        continue;
      }
      const hash = note.bodyRef.sha256;
      let body = cachedSearchValue(storage, 'body:' + hash);
      if (body === undefined) body = (await loadKnowledgeBody(storage, note)).formatted_markdown.toLocaleLowerCase();
      rows.set(id, [id, hash, body]);
    }
    parts = parts.filter(part => part.prefix !== prefix);
    if (rows.size) parts.push(...(await storePart(storage, prefix, [...rows.values()])));
  }
  parts.sort((a, b) => a.prefix.localeCompare(b.prefix));
  const directory = await writeKnowledgeDirectory(storage, parts, priorIndex, part => loadSearchPart(storage, part));
  next._knowledgeSearch = { version: 1, parts, ...(directory ? { directory } : {}) };
  return next;
}
