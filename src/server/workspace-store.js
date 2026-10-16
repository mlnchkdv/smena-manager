import { getStorageProvider } from './storage/index.js';
import { hasSharedRedis, withRedisLock, WorkspaceCoordinationError } from './redis.js';
import { directDriveWritesEnabled } from './deployment-config.js';
import { adminFieldsChanged } from '../shared/workspace-permissions.js';
import { migrateLegacyWorkspaceBrand } from '../shared/workspace-brand.js';
import { migrateNotificationRecipients } from '../shared/notification-model.js';
import { WORKSPACE_TRANSPORT_MAX_BYTES, workspaceTransportBytes } from '../shared/workspace-size.js';
import { validateWorkspaceData } from '../shared/workspace-schema.js';

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
    workspaces: [],
    me: null,
    members: [],
    projects: [],
    tasks: [],
    comments: [],
    knowledgeNotes: [],
    knowledgeFolders: [],
    links: [],
    linkFolders: [],
    files: [],
    activity: [],
    notifs: [],
    events: [],
    projOrder: [],
    savedViews: [],
    recentSearches: [],
    sessions: [],
    invoices: [],
    trash: [],
    tfa: false,
    notifPrefs: {},
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
  const normalized = { ...createEmptyDatabase(), ...value, schemaVersion: CURRENT_SCHEMA_VERSION };
  if (!Object.hasOwn(value, 'notifs') && Array.isArray(value.notifications)) normalized.notifs = value.notifications;
  return validateWorkspaceData(migrateNotificationRecipients(migrateLegacyWorkspaceBrand(normalized)));
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

export async function createWorkspaceBackup(label = '') {
  const current = await getWorkspaceDatabase();
  const storage = getStorageProvider();
  if (typeof storage.createDatabaseBackup !== 'function') throw new Error('Workspace backups are not supported by the configured storage.');
  return storage.createDatabaseBackup(current, label);
}

export async function listWorkspaceBackups() {
  const storage = getStorageProvider();
  if (typeof storage.listDatabaseBackups !== 'function') return [];
  return storage.listDatabaseBackups();
}

export async function restoreWorkspaceBackup(id, expectedRevision) {
  const storage = getStorageProvider();
  if (typeof storage.loadDatabaseBackup !== 'function') throw new Error('Workspace backups are not supported by the configured storage.');
  const backup = await storage.loadDatabaseBackup(id);
  await createWorkspaceBackup('Перед восстановлением');
  return replaceWorkspaceDatabase(backup, expectedRevision, { role: 'admin' });
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

export class WorkspaceSizeError extends Error {
  constructor(actualBytes) {
    super('Workspace data exceeds the 4 MB synchronization limit.');
    this.name = 'WorkspaceSizeError';
    this.statusCode = 413;
    this.code = 'WORKSPACE_TOO_LARGE';
    this.maxBytes = WORKSPACE_TRANSPORT_MAX_BYTES;
    this.actualBytes = actualBytes;
  }
}

async function mutateInsideLock(mutator, expectedRevision, role) {
  const current = await initWorkspaceStore();
  if (current.revision !== expectedRevision) throw new RevisionConflictError(current.revision);
  const nextData = await mutator(clone(current));
  if (!nextData || typeof nextData !== 'object' || Array.isArray(nextData)) {
    throw new TypeError('Workspace mutation must return a JSON object.');
  }
  if (current.me) nextData.me = current.me;
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
  const transportBytes = workspaceTransportBytes(next, next.revision);
  if (transportBytes > WORKSPACE_TRANSPORT_MAX_BYTES) throw new WorkspaceSizeError(transportBytes);
  const storage = getStorageProvider();
  try {
    await storage.saveDatabase(next);
  } catch (error) {
    const status = Number(error?.response?.status || error?.code);
    if (status !== 412) throw error;
    const latest = await storage.loadDatabase().catch(() => null);
    if (latest) {
      database = normalizeDatabase(latest);
      lastLoadedAt = Date.now();
    }
    throw new RevisionConflictError(Number(latest?.revision ?? current.revision));
  }
  database = next;
  lastLoadedAt = Date.now();
  return clone(next);
}

export async function mutateWorkspaceDatabase(mutator, expectedRevision, options = {}) {
  if (typeof mutator !== 'function') throw new TypeError('A workspace mutation function is required.');
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    throw new TypeError('A non-negative expected revision is required.');
  }

  if (process.env.VERCEL) {
    if (hasSharedRedis()) {
      return withRedisLock('smena:workspace:write:v1', async () => {
        await reloadWorkspaceStore();
        return mutateInsideLock(mutator, expectedRevision, options.role || 'admin');
      });
    }
    if (!directDriveWritesEnabled()) {
      throw new WorkspaceCoordinationError('Workspace writes are not enabled for this deployment.');
    }
    const result = localWriteQueue.then(async () => {
      await reloadWorkspaceStore();
      return mutateInsideLock(mutator, expectedRevision, options.role || 'admin');
    });
    localWriteQueue = result.catch(() => undefined);
    return result;
  }

  const result = localWriteQueue.then(() => mutateInsideLock(mutator, expectedRevision, options.role || 'admin'));
  localWriteQueue = result.catch(() => undefined);
  return result;
}

export async function replaceWorkspaceDatabase(nextData, expectedRevision, options = {}) {
  if (!nextData || typeof nextData !== 'object' || Array.isArray(nextData)) {
    throw new TypeError('Workspace data must be a JSON object.');
  }
  return mutateWorkspaceDatabase(current => ({ ...current, ...nextData }), expectedRevision, options);
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
