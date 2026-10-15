import { getStorageProvider } from './storage/index.js';
import { hasSharedRedis, withRedisLock, WorkspaceCoordinationError } from './redis.js';
import { adminFieldsChanged } from '../shared/workspace-permissions.js';

export const CURRENT_SCHEMA_VERSION = 1;

let database = null;
let initializationPromise = null;
let reloadPromise = null;
let localWriteQueue = Promise.resolve();
let lastLoadedAt = 0;

function createEmptyDatabase() {
  const now = new Date().toISOString();
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    revision: 0,
    createdAt: now,
    updatedAt: now,
    workspace: { name: 'Smena Manager' },
    members: [],
    projects: [],
    tasks: [],
    comments: [],
    files: [],
    activity: [],
    notifications: [],
    events: [],
    savedViews: [],
  };
}

function normalizeDatabase(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Workspace database must be a JSON object.');
  }
  const version = Number(value.schemaVersion || 1);
  if (version > CURRENT_SCHEMA_VERSION) {
    throw new Error(`Workspace schema ${version} is newer than supported schema ${CURRENT_SCHEMA_VERSION}.`);
  }
  return { ...createEmptyDatabase(), ...value, schemaVersion: CURRENT_SCHEMA_VERSION };
}

function clone(value) {
  return structuredClone(value);
}

export async function initWorkspaceStore() {
  if (database) return database;
  if (initializationPromise) return initializationPromise;

  initializationPromise = (async () => {
    const storage = getStorageProvider();
    await storage.init();
    const stored = await storage.loadDatabase();
    database = stored ? normalizeDatabase(stored) : createEmptyDatabase();
    if (!stored) await storage.saveDatabase(database);
    lastLoadedAt = Date.now();
    return database;
  })();

  try {
    return await initializationPromise;
  } finally {
    initializationPromise = null;
  }
}

export async function reloadWorkspaceStore(options = {}) {
  const maxAgeMs = Math.max(0, Number(options.maxAgeMs || 0));
  if (database && maxAgeMs && Date.now() - lastLoadedAt <= maxAgeMs) return database;
  if (reloadPromise) return reloadPromise;
  reloadPromise = (async () => {
    const storage = getStorageProvider();
    await storage.init();
    const stored = await storage.loadDatabase();
    if (!stored) throw new Error('The configured storage does not contain a workspace database.');
    database = normalizeDatabase(stored);
    lastLoadedAt = Date.now();
    return database;
  })();
  try {
    return await reloadPromise;
  } finally {
    reloadPromise = null;
  }
}

export async function getWorkspaceDatabase() {
  if (process.env.VERCEL) await reloadWorkspaceStore({ maxAgeMs: 2_000 });
  else await initWorkspaceStore();
  return clone(database);
}

export class RevisionConflictError extends Error {
  constructor(currentRevision) {
    super('The workspace changed after it was loaded. Refresh and retry.');
    this.name = 'RevisionConflictError';
    this.statusCode = 409;
    this.code = 'REVISION_CONFLICT';
    this.currentRevision = currentRevision;
  }
}

export class WorkspacePermissionError extends Error {
  constructor(fields) {
    super('Only an administrator can change workspace settings or membership.');
    this.name = 'WorkspacePermissionError';
    this.statusCode = 403;
    this.code = 'ADMIN_REQUIRED';
    this.fields = fields;
  }
}

async function replaceInsideLock(nextData, expectedRevision, role) {
  const current = await initWorkspaceStore();
  if (current.revision !== expectedRevision) throw new RevisionConflictError(current.revision);
  if (role === 'editor') {
    const fields = adminFieldsChanged(current, nextData);
    if (fields.length) throw new WorkspacePermissionError(fields);
  }
  const now = new Date().toISOString();
  const next = normalizeDatabase({
    ...nextData,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    revision: current.revision + 1,
    createdAt: current.createdAt,
    updatedAt: now,
  });
  await getStorageProvider().saveDatabase(next);
  database = next;
  lastLoadedAt = Date.now();
  return clone(next);
}

export async function replaceWorkspaceDatabase(nextData, expectedRevision, options = {}) {
  if (!nextData || typeof nextData !== 'object' || Array.isArray(nextData)) {
    throw new TypeError('Workspace data must be a JSON object.');
  }
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    throw new TypeError('A non-negative expected revision is required.');
  }

  if (process.env.VERCEL) {
    if (!hasSharedRedis()) {
      throw new WorkspaceCoordinationError('REDIS_URL is required for workspace writes on Vercel.');
    }
    return withRedisLock('smena:workspace:write:v1', async () => {
      await reloadWorkspaceStore();
      return replaceInsideLock(nextData, expectedRevision, options.role || 'admin');
    });
  }

  const result = localWriteQueue.then(() => replaceInsideLock(nextData, expectedRevision, options.role || 'admin'));
  localWriteQueue = result.catch(() => undefined);
  return result;
}

export async function getWorkspaceStatus() {
  const data = await initWorkspaceStore();
  const storage = getStorageProvider();
  return {
    storage: await storage.getStatus(),
    schemaVersion: data.schemaVersion,
    revision: data.revision,
    updatedAt: data.updatedAt,
  };
}

export function resetWorkspaceStore() {
  database = null;
  initializationPromise = null;
  reloadPromise = null;
  localWriteQueue = Promise.resolve();
  lastLoadedAt = 0;
}
