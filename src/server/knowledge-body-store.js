import { createHash } from 'node:crypto';
import { KNOWLEDGE_BODY_KIND, KNOWLEDGE_BODY_MAX_BYTES, externalKnowledgeBody, validKnowledgeBodyRef } from '../shared/knowledge-body.js';

export const knowledgeBodyError = (code = 'KNOWLEDGE_BODY_INTEGRITY', statusCode = 503) =>
  Object.assign(
    new Error(
      code === 'KNOWLEDGE_BODY_LIMIT' ? 'The note body exceeds the storage object limit.' : 'The note body is unavailable or failed its integrity check.',
    ),
    { code, statusCode },
  );
const digest = text => createHash('sha256').update(text).digest('hex');

export async function storeKnowledgeBody(storage, note) {
  if (typeof note?.id !== 'string' || !note.id || typeof note.formatted_markdown !== 'string') throw knowledgeBodyError();
  const text = JSON.stringify({ format: 'smena-knowledge-body-v1', noteId: note.id, formatted_markdown: note.formatted_markdown });
  const bytes = Buffer.byteLength(text);
  if (bytes > KNOWLEDGE_BODY_MAX_BYTES) throw knowledgeBodyError('KNOWLEDGE_BODY_LIMIT', 413);
  const sha256 = digest(text);
  await storage.writeKnowledgeBody(text, sha256);
  const metadata = { ...note };
  delete metadata.formatted_markdown;
  return { ...metadata, bodyRef: { kind: KNOWLEDGE_BODY_KIND, sha256, bytes } };
}

export async function loadKnowledgeBody(storage, note) {
  if (!externalKnowledgeBody(note)) return { ...note };
  if (!validKnowledgeBodyRef(note.bodyRef)) throw knowledgeBodyError();
  const text = await storage.readKnowledgeBody(note.bodyRef.sha256);
  if (typeof text !== 'string' || Buffer.byteLength(text) !== note.bodyRef.bytes || digest(text) !== note.bodyRef.sha256) throw knowledgeBodyError();
  let object;
  try {
    object = JSON.parse(text);
  } catch {
    throw knowledgeBodyError();
  }
  if (object.format !== 'smena-knowledge-body-v1' || object.noteId !== note.id || typeof object.formatted_markdown !== 'string') throw knowledgeBodyError();
  const metadata = { ...note };
  delete metadata.bodyRef;
  return { ...metadata, formatted_markdown: object.formatted_markdown };
}

// The source snapshot is never modified; publishing the result is a separate
// revision-checked operation. No files, other notes or historical bodies read.
export async function stageKnowledgeBodyWindow(data, storage, ids, { signal } = {}) {
  if (!Array.isArray(ids) || ids.length > 20 || ids.some(id => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length)
    throw new TypeError('Invalid note migration window.');
  const selected = new Set(ids);
  if (ids.some(id => !data.knowledgeNotes?.some(note => note.id === id)))
    throw Object.assign(new Error('Note not found.'), { code: 'KNOWLEDGE_NOT_FOUND', statusCode: 404 });
  const knowledgeNotes = [];
  for (const note of data.knowledgeNotes || []) {
    if (!selected.has(note.id)) {
      knowledgeNotes.push(note);
      continue;
    }
    signal?.throwIfAborted();
    // Canonical existing refs must verify too; a caller cannot migrate a
    // broken object into the published index just by marking it completed.
    if (externalKnowledgeBody(note)) {
      await loadKnowledgeBody(storage, note);
      knowledgeNotes.push(note);
    } else knowledgeNotes.push(await storeKnowledgeBody(storage, note));
  }
  signal?.throwIfAborted();
  return { ...data, knowledgeNotes };
}

export async function expandKnowledgeBodies(data, storage, { ids, includeTrash = true } = {}) {
  const selected = ids && new Set(ids);
  const needsBody = note => externalKnowledgeBody(note) && (!selected || selected.has(note.id));
  if (!data.knowledgeNotes?.some(needsBody) && !(includeTrash && data.trash?.some(item => item.kind === 'note' && needsBody(item.data?.note)))) return data;
  const expand = note => (!selected || selected.has(note.id) ? loadKnowledgeBody(storage, note) : note);
  const next = { ...data };
  if (Array.isArray(data.knowledgeNotes)) {
    next.knowledgeNotes = [];
    for (const note of data.knowledgeNotes) next.knowledgeNotes.push(await expand(note));
  }
  if (includeTrash && Array.isArray(data.trash)) {
    next.trash = [];
    for (const item of data.trash)
      next.trash.push(item.kind === 'note' && item.data?.note ? { ...item, data: { ...item.data, note: await expand(item.data.note) } } : item);
  }
  return next;
}

export async function externalizeKnowledgeBodies(data, storage) {
  const store = note => {
    if (externalKnowledgeBody(note)) return note;
    if (note.bodyPending || note.bodyToken || (note.formatted_markdown != null && typeof note.formatted_markdown !== 'string')) throw knowledgeBodyError();
    return storeKnowledgeBody(storage, { ...note, formatted_markdown: note.formatted_markdown ?? '' });
  };
  const next = { ...data };
  if (Array.isArray(data.knowledgeNotes)) {
    next.knowledgeNotes = [];
    for (const note of data.knowledgeNotes) next.knowledgeNotes.push(await store(note));
  }
  if (Array.isArray(data.trash)) {
    next.trash = [];
    for (const item of data.trash)
      next.trash.push(item.kind === 'note' && item.data?.note ? { ...item, data: { ...item.data, note: await store(item.data.note) } } : item);
  }
  return next;
}
