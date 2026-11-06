import { createHash } from 'node:crypto';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { cachedSearchValue, cacheSearchValue } from './knowledge-search-cache.js';
import { knowledgeSearchError } from './knowledge-search-errors.js';

const SIZE = 2048,
  MAX = 16 * 1024 * 1024;
const digest = text => createHash('sha256').update(text).digest('hex');
function positions(a, b, c) {
  const first = (Math.imul(a ^ 2166136261, 16777619) ^ Math.imul(b, 2246822519) ^ Math.imul(c, 3266489917)) >>> 0;
  const step = ((Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ c) | 1) >>> 0;
  return [first % (SIZE * 8), ((first + step) >>> 0) % (SIZE * 8), ((first + Math.imul(step, 2)) >>> 0) % (SIZE * 8)];
}
function* grams(text) {
  // Non-whitespace trigrams cannot span searchableNote's field separators.
  // Ignoring whitespace grams also keeps metadata/body boundary phrases safe.
  for (let i = 0; i < text.length - 2; i++) {
    const gram = text.slice(i, i + 3);
    if (!/\s/u.test(gram)) yield gram;
  }
}
function filterFor(rows) {
  const bits = Buffer.alloc(SIZE);
  for (const row of rows.values())
    for (const gram of grams(row[2]))
      for (const bit of positions(gram.charCodeAt(0), gram.charCodeAt(1), gram.charCodeAt(2))) bits[bit >>> 3] |= 1 << (bit & 7);
  return bits;
}
export function directoryMayMatch(bits, terms, metadata) {
  if (!bits) return true; // Legacy indexes remain correct, without pruning.
  for (const term of terms)
    for (const gram of grams(term)) {
      if (metadata.includes(gram)) continue;
      if (positions(gram.charCodeAt(0), gram.charCodeAt(1), gram.charCodeAt(2)).some(bit => !(bits[bit >>> 3] & (1 << (bit & 7))))) return false;
    }
  return true;
}
export async function readKnowledgeDirectory(storage, index) {
  const ref = index?.directory;
  if (!ref) return null;
  if (
    ref.kind !== 'knowledge-directory-v1' ||
    !/^[a-f0-9]{64}$/.test(ref.sha256 || '') ||
    !Number.isSafeInteger(ref.bytes) ||
    ref.bytes < 1 ||
    ref.bytes > MAX ||
    !Number.isSafeInteger(ref.rawBytes) ||
    ref.rawBytes < 1 ||
    ref.rawBytes > MAX
  )
    throw knowledgeSearchError();
  const key = 'directory:' + digest(JSON.stringify([ref, index.parts.map(p => [p.prefix, p.sha256])]));
  const cached = cachedSearchValue(storage, key);
  if (cached) return cached;
  try {
    const text = await storage.readKnowledgeSearch(ref.sha256);
    if (typeof text !== 'string' || Buffer.byteLength(text) !== ref.bytes || digest(text) !== ref.sha256) throw knowledgeSearchError();
    const object = JSON.parse(text);
    if (object.format !== 'smena-knowledge-directory-v1' || object.rawBytes !== ref.rawBytes || typeof object.data !== 'string') throw knowledgeSearchError();
    const raw = inflateRawSync(Buffer.from(object.data, 'base64'), { maxOutputLength: MAX });
    if (raw.length !== ref.rawBytes) throw knowledgeSearchError();
    const rows = JSON.parse(raw.toString('utf8'));
    if (!Array.isArray(rows) || rows.length !== index.parts.length) throw knowledgeSearchError();
    const parts = new Map(index.parts.map(p => [p.prefix, p.sha256])),
      result = new Map();
    for (const row of rows) {
      if (!Array.isArray(row) || row.length !== 3 || parts.get(row[0]) !== row[1] || result.has(row[0]) || typeof row[2] !== 'string')
        throw knowledgeSearchError();
      const bits = Buffer.from(row[2], 'base64');
      if (bits.length !== SIZE || bits.toString('base64') !== row[2]) throw knowledgeSearchError();
      result.set(row[0], bits);
    }
    cacheSearchValue(storage, key, result, raw.length * 2);
    return result;
  } catch {
    throw knowledgeSearchError();
  }
}
export async function writeKnowledgeDirectory(storage, parts, previous, readRows) {
  if (!parts.length) return null;
  const old = await readKnowledgeDirectory(storage, previous);
  const before = new Map((previous?.parts || []).map(p => [p.prefix, p.sha256]));
  const rows = [];
  for (const part of parts) {
    const bits = (before.get(part.prefix) === part.sha256 && old?.get(part.prefix)) || filterFor(await readRows(part));
    rows.push([part.prefix, part.sha256, bits.toString('base64')]);
  }
  const raw = JSON.stringify(rows),
    rawBytes = Buffer.byteLength(raw);
  if (rawBytes > MAX) throw knowledgeSearchError();
  const text = JSON.stringify({ format: 'smena-knowledge-directory-v1', rawBytes, data: deflateRawSync(Buffer.from(raw), { level: 1 }).toString('base64') });
  const sha256 = digest(text);
  await storage.writeKnowledgeSearch(text, sha256);
  return { kind: 'knowledge-directory-v1', sha256, bytes: Buffer.byteLength(text), rawBytes };
}
