import { createHash } from 'node:crypto';
import { knowledgeSnapshot, KNOWLEDGE_HISTORY_LIMIT, KNOWLEDGE_VERSION_MAX_BYTES } from '../shared/knowledge-history.js';
import { readKnowledgeVersion } from './knowledge-version-blobs.js';
import { loadKnowledgeBody } from './knowledge-body-store.js';

export const knowledgeSnapshotHash = note =>
  createHash('sha256')
    .update(JSON.stringify(knowledgeSnapshot(note)))
    .digest('hex');
export function knowledgeVersionPage(database, noteId, offset = 0) {
  const note = database.knowledgeNotes?.find(item => item.id === noteId);
  if (!note) throw Object.assign(new Error('Note not found.'), { code: 'KNOWLEDGE_NOT_FOUND', statusCode: 404 });
  const versions = note.history || [];
  offset = Math.min(Math.max(0, Math.floor(Number(offset) / 5) * 5), versions.length ? Math.floor((versions.length - 1) / 5) * 5 : 0);
  return {
    versions: versions.slice(offset, offset + 5).map(({ id, title, at, by, savedAt }) => ({ id, title, at, by, savedAt })),
    offset,
    total: versions.length,
    maxVersions: KNOWLEDGE_HISTORY_LIMIT,
    maxVersionBytes: KNOWLEDGE_VERSION_MAX_BYTES,
  };
}
export async function getKnowledgeVersion(database, storage, noteId, versionId) {
  knowledgeVersionPage(database, noteId);
  const note = database.knowledgeNotes.find(item => item.id === noteId);
  const version = note.history?.find(item => item.id === versionId);
  if (!version) throw Object.assign(new Error('Note version not found.'), { code: 'KNOWLEDGE_VERSION_NOT_FOUND', statusCode: 404 });
  return { version: await readKnowledgeVersion(storage, note.id, version), noteHash: knowledgeSnapshotHash(await loadKnowledgeBody(storage, note)) };
}
