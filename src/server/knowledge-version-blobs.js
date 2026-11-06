import { createHash, randomUUID } from 'node:crypto';
import { externalKnowledgeVersion, knowledgeSnapshot, KNOWLEDGE_HISTORY_LIMIT, KNOWLEDGE_VERSION_MAX_BYTES } from '../shared/knowledge-history.js';

export function knowledgeVersionError(code, statusCode = 503) {
  return Object.assign(
    new Error(
      code === 'KNOWLEDGE_VERSION_LIMIT'
        ? 'The note version exceeds the history budget. Download the source before continuing.'
        : 'The note version is unavailable or failed its integrity check.',
    ),
    { code, statusCode },
  );
}
export function versionReference(value) {
  if (
    value?.kind !== 'knowledge-version-v1' ||
    !/^[a-f0-9]{64}$/.test(value.sha256 || '') ||
    !Number.isSafeInteger(value.bytes) ||
    value.bytes < 1 ||
    value.bytes > KNOWLEDGE_VERSION_MAX_BYTES
  )
    throw knowledgeVersionError('KNOWLEDGE_VERSION_INTEGRITY');
  return value;
}
export async function persistKnowledgeVersion(storage, noteId, version) {
  const content = {
    ...knowledgeSnapshot(version),
    id: version.id,
    at: version.at,
    by: version.by || '',
    editedBy: version.editedBy || '',
    savedAt: version.savedAt || 0,
  };
  const text = JSON.stringify({ format: 'smena-knowledge-version-v1', noteId, version: content });
  const bytes = Buffer.byteLength(text);
  if (bytes > KNOWLEDGE_VERSION_MAX_BYTES) throw knowledgeVersionError('KNOWLEDGE_VERSION_LIMIT', 413);
  const sha256 = createHash('sha256').update(text).digest('hex');
  await storage.writeKnowledgeVersion(text, sha256);
  return {
    id: content.id,
    title: content.title,
    at: content.at,
    by: content.by,
    editedBy: content.editedBy,
    savedAt: content.savedAt,
    contentRef: { kind: 'knowledge-version-v1', sha256, bytes },
  };
}
export async function readKnowledgeVersion(storage, noteId, version) {
  if (!externalKnowledgeVersion(version)) return structuredClone(version);
  const ref = versionReference(version.contentRef);
  const text = await storage.readKnowledgeVersion(ref.sha256);
  if (typeof text !== 'string' || Buffer.byteLength(text) !== ref.bytes || createHash('sha256').update(text).digest('hex') !== ref.sha256)
    throw knowledgeVersionError('KNOWLEDGE_VERSION_INTEGRITY');
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw knowledgeVersionError('KNOWLEDGE_VERSION_INTEGRITY');
  }
  if (body.format !== 'smena-knowledge-version-v1' || body.noteId !== noteId || body.version?.id !== version.id)
    throw knowledgeVersionError('KNOWLEDGE_VERSION_INTEGRITY');
  return body.version;
}

export async function storedNoteHistory(storage, previous, next, now = Date.now()) {
  if (!previous) return [];
  const prior = Array.isArray(previous.history) ? previous.history.slice(0, KNOWLEDGE_HISTORY_LIMIT) : [];
  const changed = JSON.stringify(knowledgeSnapshot(previous)) !== JSON.stringify(knowledgeSnapshot(next));
  if (!changed) return prior;
  const grouped = !next.restoreFromVersion && prior[0]?.editedBy === next.updatedBy && now - Number(prior[0]?.savedAt || 0) < 120000;
  const history = [];
  if (!grouped)
    history.push(
      await persistKnowledgeVersion(storage, previous.id, {
        ...knowledgeSnapshot(previous),
        id: `v-${randomUUID()}`,
        at: previous.updatedAt || new Date(now).toISOString(),
        by: previous.updatedBy || '',
        editedBy: next.updatedBy || '',
        savedAt: now,
      }),
    );
  // Legacy inline snapshots remain available and are migrated before their
  // references enter the atomic root. A failed blob write stops the note edit.
  for (const version of prior.slice(0, KNOWLEDGE_HISTORY_LIMIT - history.length))
    history.push(externalKnowledgeVersion(version) ? structuredClone(version) : await persistKnowledgeVersion(storage, previous.id, version));
  return history;
}

// Standalone backups embed verified bytes, including histories in Trash. They
// must not depend on the continued existence of an external version object.
async function mapStoredNotes(data, map) {
  const next = { ...data };
  if (Array.isArray(data.knowledgeNotes)) {
    next.knowledgeNotes = [];
    for (const note of data.knowledgeNotes) next.knowledgeNotes.push(await map(note));
  }
  if (Array.isArray(data.trash)) {
    next.trash = [];
    for (const item of data.trash)
      next.trash.push(item.kind === 'note' && item.data?.note ? { ...item, data: { ...item.data, note: await map(item.data.note) } } : item);
  }
  return next;
}
export async function expandKnowledgeVersions(data, storage) {
  return mapStoredNotes(data, async note => {
    if (!Array.isArray(note.history) || !note.history.some(externalKnowledgeVersion)) return note;
    const history = [];
    for (const version of note.history) history.push(await readKnowledgeVersion(storage, note.id, version));
    return { ...note, history };
  });
}

export async function externalizeKnowledgeVersions(data, storage) {
  return mapStoredNotes(data, async note => {
    if (!Array.isArray(note.history)) return note;
    const history = [];
    for (const version of note.history.slice(0, KNOWLEDGE_HISTORY_LIMIT)) {
      if (externalKnowledgeVersion(version)) {
        await readKnowledgeVersion(storage, note.id, version);
        history.push(version);
      } else history.push(await persistKnowledgeVersion(storage, note.id, version));
    }
    return { ...note, history };
  });
}
