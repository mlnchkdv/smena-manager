import { createHash } from 'node:crypto';
import { getWorkspaceDatabase } from './workspace-store.js';
import { knowledgeActor } from './knowledge-access.js';
import { externalKnowledgeBody } from '../shared/knowledge-body.js';

// A token describes the canonical body version; it never grants read access.
export function knowledgeBodyToken(note) {
  return createHash('sha256')
    .update(JSON.stringify([note.id, externalKnowledgeBody(note) ? note.bodyRef : String(note.formatted_markdown || '')]))
    .digest('hex');
}

export function knowledgeCatalogNote(note) {
  const value = { ...note, bodyToken: knowledgeBodyToken(note), bodyPending: true };
  delete value.formatted_markdown;
  delete value.bodyRef;
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

export async function readKnowledgeCatalog(profile, profiles = []) {
  const database = await getWorkspaceDatabase({ fields: ['members', 'knowledgeNotes', 'knowledgeFolders', '_documentRevisions', 'createdAt', 'updatedAt'] });
  knowledgeActor(database, profile, profiles);
  return knowledgeCatalogDocument(database);
}
