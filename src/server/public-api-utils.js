import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { integrationError } from './integration-registry.js';
import { knowledgeEntityVersion, knowledgeEntityEtag } from './knowledge-entity-version.js';
import { INTEGRATION_LIMITS } from '../shared/integration-contract.js';

const cursorSecret = process.env.SESSION_SECRET || randomBytes(32).toString('hex');
export const apiDigest = value =>
  createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(value))
    .digest('hex');
export function apiInteger(value, fallback, max) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d{1,8}$/.test(value) || Number(value) < 1 || Number(value) > max) throw integrationError('INVALID_API_PARAMETERS');
  return Number(value);
}
export function apiText(value, fallback = '', max = 1000) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || value.length > max) throw integrationError('INVALID_API_PARAMETERS');
  return value;
}
export function encodeApiCursor(context, offset) {
  const body = Buffer.from(JSON.stringify({ context, offset, until: Date.now() + 15 * 60000 })).toString('base64url');
  return body + '.' + createHmac('sha256', cursorSecret).update(body).digest('base64url');
}
export function decodeApiCursor(value, context) {
  if (!value) return 0;
  if (typeof value !== 'string' || value.length > 4096) throw integrationError('INVALID_API_CURSOR');
  const [body, signature, extra] = value.split('.');
  const expected = createHmac('sha256', cursorSecret)
    .update(body || '')
    .digest();
  const supplied = Buffer.from(signature || '', 'base64url');
  if (extra || expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) throw integrationError('INVALID_API_CURSOR');
  let data;
  try {
    data = JSON.parse(Buffer.from(body, 'base64url'));
  } catch {
    throw integrationError('INVALID_API_CURSOR');
  }
  if (data.context !== context || data.until < Date.now()) throw integrationError('API_CURSOR_STALE', 409);
  if (!Number.isSafeInteger(data.offset) || data.offset < 0) throw integrationError('INVALID_API_CURSOR');
  return data.offset;
}
export function apiNoteUrl(workspace, id) {
  return `${process.env.APP_ORIGIN || 'https://smena.team'}/${encodeURIComponent(workspace?.url || 'workspace')}/note/${encodeURIComponent(id)}`;
}
export function apiNoteDto(note, workspaceId, workspace, { summaryOnly = false } = {}) {
  const base = {
    id: note.id,
    workspace_id: workspaceId,
    title: String(note.title || ''),
    folder_id: note.folderId || null,
    type_id: note.typeId || 'note',
    version: knowledgeEntityVersion(note).number,
    etag: knowledgeEntityEtag(note),
    updated_at: note.updatedAt || null,
    url: apiNoteUrl(workspace, note.id),
  };
  return summaryOnly
    ? base
    : {
        ...base,
        summary: note.summary || '',
        tags: note.tags || [],
        aliases: note.aliases || [],
        properties: note.properties || {},
        content_format: 'markdown',
      };
}
export function apiTextPage(text, query, context) {
  const max = apiInteger(query.max_bytes, INTEGRATION_LIMITS.textChunkBytes, INTEGRATION_LIMITS.textChunkBytes);
  const start = decodeApiCursor(query.cursor, context);
  if (start > text.length) throw integrationError('INVALID_API_CURSOR');
  let end = start,
    bytes = 0;
  for (const point of text.slice(start)) {
    const size = Buffer.byteLength(point);
    if (bytes + size > max) break;
    bytes += size;
    end += point.length;
  }
  if (end === start && start < text.length) throw integrationError('INVALID_API_PARAMETERS');
  return {
    content_markdown: text.slice(start, end),
    content_sha256: apiDigest(text),
    content_bytes: Buffer.byteLength(text),
    next_cursor: end < text.length ? encodeApiCursor(context, end) : null,
  };
}
