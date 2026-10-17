import { getStorageProvider } from './storage/index.js';
import { hasSharedRedis, withRedisLock, WorkspaceCoordinationError } from './redis.js';
import { directDriveWritesEnabled } from './deployment-config.js';
import { WORKSPACE_TRANSPORT_MAX_BYTES, workspaceTransportBytes } from '../shared/workspace-size.js';
import { DOCUMENT_NAMES, workspaceDocumentData } from '../shared/workspace-documents.js';
import { copyStorageVersion, storageVersion } from './storage/version-token.js';

const documents = new Map();
const initialization = new Map();
const localQueues = new Map(DOCUMENT_NAMES.map(name => [name, Promise.resolve()]));

function assertName(name) {
  if (!DOCUMENT_NAMES.includes(name)) throw Object.assign(new Error('Workspace document not found.'), { statusCode: 404, code: 'DOCUMENT_NOT_FOUND' });
}

function emptyDocument(name) {
  const now = new Date().toISOString();
  return { schemaVersion: 1, revision: 0, createdAt: now, updatedAt: now, ...workspaceDocumentData(name) };
}

function normalizeDocument(name, value) {
  const base = emptyDocument(name);
  const data = workspaceDocumentData(name, value);
  for (const [field, collection] of Object.entries(data)) {
    if (collection.some(item => !item || typeof item !== 'object' || Array.isArray(item))) {
      throw Object.assign(new TypeError(`Workspace document has an invalid collection: ${field}.`), {
        statusCode: 400,
        code: 'WORKSPACE_INVALID',
        fields: [field],
      });
    }
  }
  return copyStorageVersion(value, {
    ...base,
    ...data,
    revision: Number.isSafeInteger(value?.revision) && value.revision >= 0 ? value.revision : 0,
    createdAt: value?.createdAt || base.createdAt,
    updatedAt: value?.updatedAt || base.updatedAt,
  });
}

async function initializeDocument(name, legacyData = {}) {
  assertName(name);
  if (documents.has(name)) return documents.get(name);
  if (initialization.has(name)) return initialization.get(name);
  const promise = (async () => {
    const storage = getStorageProvider();
    await storage.init();
    const stored = await storage.loadDocument(name);
    const document = stored ? normalizeDocument(name, stored) : normalizeDocument(name, workspaceDocumentData(name, legacyData));
    if (!stored) await storage.saveDocument(name, document);
    documents.set(name, document);
    return document;
  })();
  initialization.set(name, promise);
  try {
    return await promise;
  } finally {
    initialization.delete(name);
  }
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

export async function getWorkspaceDocument(name, legacyData = {}) {
  const current = process.env.VERCEL ? null : documents.get(name);
  if (current) return copyStorageVersion(current, structuredClone(current));
  if (process.env.VERCEL) {
    documents.delete(name);
    const storage = getStorageProvider();
    await storage.init();
    const stored = await storage.loadDocument(name);
    if (stored) {
      const normalized = normalizeDocument(name, stored);
      documents.set(name, normalized);
      return copyStorageVersion(normalized, structuredClone(normalized));
    }
  }
  const initialized = await initializeDocument(name, legacyData);
  return copyStorageVersion(initialized, structuredClone(initialized));
}

async function replaceInsideLock(name, nextData, expectedRevision, options = {}) {
  const current = await getWorkspaceDocument(name, options.legacyData);
  if (current.revision !== expectedRevision) throw new WorkspaceDocumentConflictError(current.revision);
  const next = normalizeDocument(name, {
    ...nextData,
    revision: current.revision + 1,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
  });
  const actualBytes = workspaceTransportBytes(workspaceDocumentData(name, next), next.revision);
  if (actualBytes > WORKSPACE_TRANSPORT_MAX_BYTES) {
    throw Object.assign(new Error(`The ${name} document exceeds the 4 MB synchronization limit.`), {
      statusCode: 413,
      code: 'WORKSPACE_TOO_LARGE',
      maxBytes: WORKSPACE_TRANSPORT_MAX_BYTES,
      actualBytes,
    });
  }
  await options.coordination?.assertOwnership?.();
  const storage = getStorageProvider();
  try {
    await storage.saveDocument(name, next, { expectedEtag: storageVersion(current) });
  } catch (error) {
    const status = Number(error?.response?.status || error?.code);
    if (status !== 412) throw error;
    documents.delete(name);
    const latest = await getWorkspaceDocument(name, options.legacyData).catch(() => current);
    throw new WorkspaceDocumentConflictError(latest.revision);
  }
  documents.set(name, next);
  return structuredClone(next);
}

export async function replaceWorkspaceDocument(name, nextData, expectedRevision, options = {}) {
  assertName(name);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new TypeError('A non-negative expected revision is required.');
  if (process.env.VERCEL) {
    if (hasSharedRedis()) {
      return withRedisLock(`smena:workspace:${name}:write:v1`, coordination =>
        replaceInsideLock(name, nextData, expectedRevision, { ...options, coordination }),
      );
    }
    if (!directDriveWritesEnabled()) throw new WorkspaceCoordinationError('Workspace writes are not enabled for this deployment.');
  }
  const queue = localQueues.get(name) || Promise.resolve();
  const result = queue.then(() => replaceInsideLock(name, nextData, expectedRevision, options));
  localQueues.set(
    name,
    result.catch(() => undefined),
  );
  return result;
}

export function resetWorkspaceDocumentStore() {
  documents.clear();
  initialization.clear();
  for (const name of DOCUMENT_NAMES) localQueues.set(name, Promise.resolve());
}
