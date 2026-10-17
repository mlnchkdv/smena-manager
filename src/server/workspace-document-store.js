import { DOCUMENT_NAMES, workspaceDocumentData } from '../shared/workspace-documents.js';
import { validateDocumentInput } from '../shared/workspace-schema.js';
import { getWorkspaceDatabase, mutateWorkspaceDatabase } from './workspace-store.js';

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
  return structuredClone(projectDocument(name, current));
}

export async function replaceWorkspaceDocument(name, nextData, expectedRevision) {
  assertName(name);
  validateDocumentInput(name, nextData);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new TypeError('A non-negative expected revision is required.');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await getWorkspaceDatabase();
    try {
      const saved = await mutateWorkspaceDatabase(
        database => {
          const document = projectDocument(name, database);
          if (document.revision !== expectedRevision) throw new WorkspaceDocumentConflictError(document.revision);
          Object.assign(database, workspaceDocumentData(name, nextData));
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
        { role: 'admin' },
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
