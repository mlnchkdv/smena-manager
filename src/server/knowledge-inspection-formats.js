import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { KNOWLEDGE_BODY_MAX_BYTES } from '../shared/knowledge-body.js';
import { SEARCH_OBJECT_MAX_BYTES } from './knowledge-search-store.js';
import { knowledgeMetadataFields } from './storage/knowledge-metadata-shards.js';

const exact = (value, fields) => Object.keys(value).every(key => fields.includes(key));
const id = value => typeof value === 'string' && value.length > 0 && value.length <= 180;
const hash = value => createHash('sha256').update(value).digest('hex');
const markdown = value => typeof value === 'string' && Buffer.byteLength(value) <= KNOWLEDGE_BODY_MAX_BYTES;

// An app-owned filename and valid JSON are insufficient evidence of a known
// object format. Unknown/future formats remain unclassified, never candidates.
export function inspectedKnowledgeKind(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (value.format === 'smena-knowledge-body-v1')
    return exact(value, ['format', 'noteId', 'formatted_markdown']) && id(value.noteId) && markdown(value.formatted_markdown) ? 'body' : null;
  if (value.format === 'smena-knowledge-version-v1')
    return exact(value, ['format', 'noteId', 'version']) && id(value.noteId) && id(value.version?.id) && markdown(value.version?.formatted_markdown)
      ? 'version'
      : null;
  if (value.format === 'smena-knowledge-metadata-v1') {
    if (
      !exact(value, ['format', 'field', 'prefix', 'rows']) ||
      !knowledgeMetadataFields.includes(value.field) ||
      !/^[a-f0-9]{1,6}$/.test(value.prefix || '') ||
      !Array.isArray(value.rows)
    )
      return null;
    const ids = new Set();
    return value.rows.every(
      row =>
        Array.isArray(row) &&
        row.length === 2 &&
        id(row[0]) &&
        !ids.has(row[0]) &&
        ids.add(row[0]) &&
        hash(row[0]).startsWith(value.prefix) &&
        row[1] &&
        typeof row[1] === 'object' &&
        !Array.isArray(row[1]) &&
        (value.field === '_knowledgeSearch' || row[1].id === row[0]),
    )
      ? 'metadata'
      : null;
  }
  if (value.format === 'smena-knowledge-search-v1') {
    if (
      !exact(value, ['format', 'prefix', 'rawBytes', 'data']) ||
      !/^[a-f0-9]{1,6}$/.test(value.prefix || '') ||
      !Number.isSafeInteger(value.rawBytes) ||
      value.rawBytes < 2 ||
      value.rawBytes > SEARCH_OBJECT_MAX_BYTES ||
      typeof value.data !== 'string' ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(value.data)
    )
      return null;
    try {
      const raw = inflateRawSync(Buffer.from(value.data, 'base64'), { maxOutputLength: SEARCH_OBJECT_MAX_BYTES });
      if (raw.length !== value.rawBytes) return null;
      const rows = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)),
        ids = new Set();
      return Array.isArray(rows) &&
        rows.every(
          row =>
            Array.isArray(row) &&
            row.length === 3 &&
            id(row[0]) &&
            !ids.has(row[0]) &&
            ids.add(row[0]) &&
            hash(row[0]).startsWith(value.prefix) &&
            /^[a-f0-9]{64}$/.test(row[1]) &&
            typeof row[2] === 'string',
        )
        ? 'search'
        : null;
    } catch {
      return null;
    }
  }
  return null;
}
