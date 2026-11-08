import { createHash } from 'node:crypto';
import { noteCardExcerpt } from '../shared/knowledge-search.js';
import { getWorkspaceDatabase } from './workspace-store.js';
import { knowledgeActor } from './knowledge-access.js';
import { externalKnowledgeBody } from '../shared/knowledge-body.js';
import { knowledgeIntakeSummary } from '../shared/knowledge-intake.js';

// A token describes the canonical body version; it never grants read access.
export function knowledgeBodyToken(note) {
  if (externalKnowledgeBody(note)) return note.bodyRef.sha256;
  return createHash('sha256')
    .update(JSON.stringify({ format: 'smena-knowledge-body-v1', noteId: note.id, formatted_markdown: String(note.formatted_markdown || '') }))
    .digest('hex');
}

export function knowledgeCatalogNote(note) {
  const value = {
    ...note,
    bodyPreview: externalKnowledgeBody(note) ? note.bodyPreview || '' : noteCardExcerpt(note, ''),
    bodyToken: knowledgeBodyToken(note),
    bodyPending: true,
  };
  delete value.formatted_markdown;
  delete value.bodyRef;
  delete value.searchVersion;
  delete value.governance;
  delete value.intake;
  const intake = knowledgeIntakeSummary(note);
  if (intake) value.intakeSummary = intake;
  else delete value.intakeSummary;
  value.history = (note.history || []).map(version => {
    const { id, at, by, editedBy, savedAt, contentRef } = version;
    return { id, at, by, editedBy, savedAt, ...(contentRef ? { contentRef } : { remote: true }) };
  });
  return value;
}

export function knowledgeCatalogDocument(database) {
  const revision = database._documentRevisions?.knowledge || {};
  return {
    schemaVersion: 1,
    revision: Number(revision.revision || 0),
    createdAt: revision.createdAt || database.createdAt,
    updatedAt: revision.updatedAt || database.updatedAt,
    knowledgeNotes: (database.knowledgeNotes || []).map(knowledgeCatalogNote),
    knowledgeFolders: structuredClone(database.knowledgeFolders || []),
  };
}

export function knowledgeCoreCatalog(data) {
  return {
    ...data,
    trash: (data.trash || []).map(item =>
      item.kind === 'note' && item.data?.note ? { ...item, data: { ...item.data, note: knowledgeCatalogNote(item.data.note) } } : item,
    ),
  };
}

export function restoreKnowledgeTrashReferences(current, incoming) {
  if (!Array.isArray(incoming.trash)) return incoming;
  const canonical = new Map((current.trash || []).map(item => [item.id, item]));
  return {
    ...incoming,
    trash: incoming.trash.map(item => {
      if (item.kind !== 'note' || !item.data?.note?.bodyPending) return item;
      const stored = canonical.get(item.id);
      if (stored?.kind !== 'note' || stored.data?.note?.id !== item.data.note.id || knowledgeBodyToken(stored.data.note) !== item.data.note.bodyToken)
        throw Object.assign(new Error('The note in trash changed. Refresh and retry.'), { statusCode: 409, code: 'KNOWLEDGE_BODY_STALE' });
      return { ...item, data: { ...item.data, note: stored.data.note } };
    }),
  };
}

export async function readKnowledgeCatalog(profile, profiles = []) {
  const database = await getWorkspaceDatabase({
    fields: ['members', 'knowledgeNotes', 'knowledgeFolders', '_documentRevisions', 'createdAt', 'updatedAt'],
    knowledgeAuthorize: root => knowledgeActor(root, profile, profiles),
  });
  knowledgeActor(database, profile, profiles);
  return knowledgeCatalogDocument(database);
}
