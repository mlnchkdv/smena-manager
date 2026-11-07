import { DOCUMENT_NAMES, workspaceDocumentData } from '../shared/workspace-documents.js';
import { validateDocumentInput } from '../shared/workspace-schema.js';
import { bindWikiReferences } from '../shared/relations.js';
import { getWorkspaceDatabase, mutateWorkspaceMetadata } from './workspace-store.js';
import { historyContent } from '../shared/knowledge-history.js';
import { storedNoteHistory, readKnowledgeVersion } from './knowledge-version-blobs.js';
import { knowledgeSnapshotHash } from './knowledge-versions.js';
import { getStorageProvider } from './storage/index.js';
import { knowledgeActor } from './knowledge-access.js';
import { expandKnowledgeBodies } from './knowledge-body-store.js';
import { externalKnowledgeBody } from '../shared/knowledge-body.js';
import { preserveKnowledgeGovernance } from '../shared/knowledge-governance.js';

function assertName(name) {
  if (!DOCUMENT_NAMES.includes(name)) throw Object.assign(new Error('Workspace document not found.'), { statusCode: 404, code: 'DOCUMENT_NOT_FOUND' });
}

export class WorkspaceDocumentConflictError extends Error {
  constructor(currentRevision) {
    super('The workspace document changed after it was loaded. Refresh and retry.');
    this.name = 'WorkspaceDocumentConflictError';
    this.statusCode = 409;
    this.code = 'REVISION_CONFLICT';
    this.currentRevision = currentRevision;
  }
}

function projectDocument(name, database) {
  const metadata = database._documentRevisions?.[name] || {};
  return {
    schemaVersion: 1,
    revision: Number(metadata.revision || 0),
    createdAt: metadata.createdAt || database.createdAt,
    updatedAt: metadata.updatedAt || database.updatedAt,
    ...workspaceDocumentData(name, database),
  };
}

export async function getWorkspaceDocument(name, aggregate) {
  assertName(name);
  // Reusing the core snapshot makes backup/revision projections coherent.
  const current = aggregate?._aggregateVersion === 1 ? aggregate : await getWorkspaceDatabase();
  return structuredClone(
    projectDocument(name, name === 'knowledge' ? await expandKnowledgeBodies(current, getStorageProvider(), { includeTrash: false }) : current),
  );
}

export async function replaceWorkspaceDocument(name, nextData, expectedRevision, options = {}) {
  assertName(name);
  validateDocumentInput(name, nextData);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new TypeError('A non-negative expected revision is required.');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    // Only the aggregate revision is needed before entering the write boundary.
    // Histories/wiki bindings come from the locked root snapshot. Unchanged
    // immutable file records need not be downloaded for document-only writes.
    const current = await getWorkspaceDatabase({ fields: ['revision'] });
    try {
      const saved = await mutateWorkspaceMetadata(
        async database => {
          const document = projectDocument(name, database);
          if (document.revision !== expectedRevision) throw new WorkspaceDocumentConflictError(document.revision);
          let incoming = structuredClone(workspaceDocumentData(name, nextData));
          if (name === 'knowledge') {
            incoming = preserveKnowledgeGovernance(database, incoming);
            const actor = options.profile && knowledgeActor(database, options.profile, options.profiles, { write: true });
            // Until the demand-aware client is enabled, legacy collection PUTs
            // must not turn an unloaded body into an empty snapshot. Per-note
            // writes use the explicit conflict-checked endpoint instead.
            if (database.knowledgeNotes.some(externalKnowledgeBody) || incoming.knowledgeNotes.some(note => Object.hasOwn(note, 'bodyRef')))
              throw Object.assign(new Error('Refresh the application before changing migrated notes.'), {
                statusCode: 409,
                code: 'KNOWLEDGE_NOTE_WRITE_REQUIRED',
              });
            bindWikiReferences(database.knowledgeNotes);
            const previous = new Map(database.knowledgeNotes.map(note => [note.id, note]));
            for (const note of incoming.knowledgeNotes) {
              const before = previous.get(note.id);
              if (note.restoreFromVersion) {
                if (!before || knowledgeSnapshotHash(before) !== note.restoreExpectedHash)
                  throw Object.assign(new Error('The note changed. Review its version again.'), { code: 'KNOWLEDGE_VERSION_STALE', statusCode: 409 });
                const selected = before.history?.find(version => version.id === note.restoreFromVersion);
                if (!selected) throw Object.assign(new Error('Note version not found.'), { code: 'KNOWLEDGE_VERSION_NOT_FOUND', statusCode: 404 });
                Object.assign(note, historyContent(await readKnowledgeVersion(getStorageProvider(), note.id, selected), incoming.knowledgeFolders));
              }
              if (actor && (!before || knowledgeSnapshotHash(before) !== knowledgeSnapshotHash(note))) {
                note.updatedBy = actor.id;
                note.updatedAt = new Date().toISOString();
              }
              note.history = await storedNoteHistory(getStorageProvider(), before, note);
              delete note.restoreFromVersion;
              delete note.restoreExpectedHash;
              const references = previous.get(note.id)?.wikiRefs;
              if (!Object.hasOwn(note, 'wikiRefs') && references) note.wikiRefs = structuredClone(references);
            }
            bindWikiReferences(incoming.knowledgeNotes);
          }
          Object.assign(database, incoming);
          database._documentRevisions = {
            ...database._documentRevisions,
            [name]: {
              revision: document.revision + 1,
              createdAt: document.createdAt,
              updatedAt: new Date().toISOString(),
            },
          };
          return database;
        },
        current.revision,
        { role: 'admin', scope: name },
      );
      return structuredClone(projectDocument(name, saved));
    } catch (error) {
      if (error instanceof WorkspaceDocumentConflictError || error.code !== 'REVISION_CONFLICT' || attempt === 2) throw error;
    }
  }
}

export function resetWorkspaceDocumentStore() {
  // Documents share the aggregate's atomic write boundary and cache.
}
