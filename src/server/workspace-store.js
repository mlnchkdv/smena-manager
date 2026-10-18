import { getStorageProvider } from './storage/index.js';
import { getRedisHealth, hasSharedRedis, withRedisLock, WorkspaceCoordinationError } from './redis.js';
import { directDriveWritesEnabled } from './deployment-config.js';
import { restoreUnauthorizedChanges } from '../shared/workspace-permissions.js';
import { migrateLegacyWorkspaceBrand } from '../shared/workspace-brand.js';
import { migrateNotificationRecipients, reconcileWorkspaceNotifications } from '../shared/notification-model.js';
import { WORKSPACE_TRANSPORT_MAX_BYTES, workspaceTransportBytes } from '../shared/workspace-size.js';
import { validateWorkspaceData, validateDocumentInput } from '../shared/workspace-schema.js';
import { DOCUMENT_NAMES, workspaceCoreData, workspaceDocumentData } from '../shared/workspace-documents.js';
import { getWorkspaceDocument, resetWorkspaceDocumentStore } from './workspace-document-store.js';
import { membershipAuditEntries, validateMembershipTransition } from '../shared/workspace-membership.js';
import { mergeClientWorkspace } from './workspace-policy.js';
import { sanitizeWorkspaceContent } from './content-security.js';
import { copyStorageVersion, storageVersion } from './storage/version-token.js';
import { migrateMilestoneIds } from '../shared/milestone-identity.js';
import { enqueueNotificationEvents } from './notification-outbox.js';
import { indexStoredFiles } from './file-registry.js';
import { applyEntityDefaults } from '../shared/workspace-defaults.js';
import { retainDetachedFile } from './file-retention.js';
import { assignCanonicalTaskKeys, validateTaskTransitions } from './task-integrity.js';
import { mergePortableWorkspace } from '../shared/portable-workspace.js';

export const CURRENT_SCHEMA_VERSION = 2;

let database = null;
let initializationPromise = null;
let reloadPromise = null;
let localWriteQueue = Promise.resolve();
let lastLoadedAt = 0;

export function createEmptyDatabase() {
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
  const data = migrateNotificationRecipients(migrateLegacyWorkspaceBrand(normalized));
  applyEntityDefaults(data);
  migrateMilestoneIds(data);
  validateWorkspaceData(data);
  const safe = sanitizeWorkspaceContent(data);
  indexStoredFiles(safe);
  return copyStorageVersion(value, safe);
}

function clone(value) {
  return copyStorageVersion(value, structuredClone(value));
}

async function loadAggregate(storage, stored) {
  const value = normalizeDatabase(stored || createEmptyDatabase());
  if (value._aggregateVersion === 1) return value;
  value._documentRevisions = {};
  for (const name of DOCUMENT_NAMES) {
    const legacy = await storage.loadDocument(name);
    if (legacy) Object.assign(value, validateDocumentInput(name, workspaceDocumentData(name, legacy)));
    value._documentRevisions[name] = {
      revision: Number(legacy?.revision || 0),
      createdAt: legacy?.createdAt || value.createdAt,
      updatedAt: legacy?.updatedAt || value.updatedAt,
    };
  }
  value._aggregateVersion = 1;
  return validateWorkspaceData(value);
}

export async function initWorkspaceStore() {
  if (database) return database;
  if (initializationPromise) return initializationPromise;

  initializationPromise = (async () => {
    const storage = getStorageProvider();
    await storage.init();
    const stored = await storage.loadDatabase();
    database = await loadAggregate(storage, stored);
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
    database = await loadAggregate(storage, stored);
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

export async function getWorkspaceRevisionStatus() {
  const storage = getStorageProvider();
  await storage.init();
  if (typeof storage.getDatabaseVersion === 'function') {
    const version = await storage.getDatabaseVersion();
    if (Number.isSafeInteger(version?.revision) && version.revision >= 0) {
      return { revision: version.revision, updatedAt: version.updatedAt || null };
    }
    const current = await reloadWorkspaceStore();
    if (typeof storage.setDatabaseRevisionMetadata === 'function') {
      await storage.setDatabaseRevisionMetadata(current.revision);
    }
    return { revision: current.revision, updatedAt: current.updatedAt };
  }
  const current = await initWorkspaceStore();
  return { revision: current.revision, updatedAt: current.updatedAt };
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

export async function importPortableWorkspace(payload, expectedRevision, conflictPolicy = 'copy') {
  if (!['copy', 'skip'].includes(conflictPolicy)) throw new TypeError('Invalid import conflict policy.');
  const current = await getWorkspaceDatabase();
  if (current.revision !== expectedRevision) throw new RevisionConflictError(current.revision);
  const preview = mergePortableWorkspace(current, payload, { conflictPolicy });
  for (const name of DOCUMENT_NAMES) validateDocumentInput(name, workspaceDocumentData(name, preview.data));
  const backup = await createWorkspaceBackup('Before portable import');
  let counts;
  let report;
  const data = await mutateWorkspaceDatabase(
    database => {
      const result = mergePortableWorkspace(database, payload, { conflictPolicy });
      counts = result.counts;
      report = result.report;
      for (const name of DOCUMENT_NAMES) {
        Object.assign(database, workspaceDocumentData(name, result.data));
        const old = database._documentRevisions[name];
        database._documentRevisions[name] = { ...old, revision: old.revision + 1, updatedAt: new Date().toISOString() };
      }
      database._importHistory = [
        ...(database._importHistory || []),
        { at: new Date().toISOString(), counts, conflicts: report.conflicts.length, backupId: backup.id },
      ].slice(-20);
      return database;
    },
    expectedRevision,
    { role: 'admin' },
  );
  return { data, counts, report, backupId: backup.id };
}

export async function deleteWorkspaceBackup(id) {
  const storage = getStorageProvider();
  if (typeof storage.deleteDatabaseBackup !== 'function') throw new Error('Workspace backup deletion is not supported by the configured storage.');
  return storage.deleteDatabaseBackup(id);
}

export async function restoreWorkspaceBackup(id, expectedRevision) {
  const storage = getStorageProvider();
  if (typeof storage.loadDatabaseBackup !== 'function') throw new Error('Workspace backups are not supported by the configured storage.');
  const backup = await storage.loadDatabaseBackup(id);
  const current = await getWorkspaceDatabase();
  if (current.revision !== expectedRevision) throw new RevisionConflictError(current.revision);
  const normalizedBackup = normalizeDatabase(backup);
  await createWorkspaceBackup('Before restore');
  return replaceWorkspaceDatabase(normalizedBackup, expectedRevision, { role: 'admin', replaceDocuments: true });
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

async function mutateInsideLock(mutator, expectedRevision, options = {}) {
  const current = await initWorkspaceStore();
  if (current.revision !== expectedRevision) throw new RevisionConflictError(current.revision);
  let nextData = await mutator(clone(current));
  if (!nextData || typeof nextData !== 'object' || Array.isArray(nextData)) {
    throw new TypeError('Workspace mutation must return a JSON object.');
  }
  if (current.me) nextData.me = current.me;
  if (options.role === 'editor') {
    const result = restoreUnauthorizedChanges(current, nextData, options.role, options.actorMemberId);
    if (result.denied) throw new WorkspacePermissionError(result.fields);
    nextData = result.data;
  }
  applyEntityDefaults(nextData);
  validateWorkspaceData(nextData);
  validateMembershipTransition(current, nextData);
  if (!options.replaceDocuments) validateTaskTransitions(current, nextData);
  if (!options.replaceDocuments) assignCanonicalTaskKeys(current, nextData);
  else
    for (const project of nextData.projects || [])
      project.seq = Math.max(Number(project.seq) || 0, Number(current.projects?.find(item => item.id === project.id)?.seq) || 0);
  const membershipActivity = membershipAuditEntries(current, nextData, options.actorMemberId, current.revision + 1);
  if (membershipActivity.length) nextData.activity = [...membershipActivity, ...(nextData.activity || [])];
  if (options.actorMemberId) {
    nextData = reconcileWorkspaceNotifications(current, nextData, {
      actorMemberId: options.actorMemberId,
      revision: current.revision + 1,
    });
  }
  const now = new Date().toISOString();
  if (options.replaceDocuments) {
    const retained = new Set((nextData.files || []).map(file => file.storageFileId || file.storageName));
    for (const file of current.files || []) if (!retained.has(file.storageFileId || file.storageName)) retainDetachedFile(nextData, file);
    nextData._notificationOutbox = [];
    nextData._aggregateVersion = 1;
    nextData._documentRevisions = Object.fromEntries(
      DOCUMENT_NAMES.map(name => [
        name,
        { revision: Number(current._documentRevisions?.[name]?.revision || 0) + 1, createdAt: current.createdAt, updatedAt: now },
      ]),
    );
  } else nextData._notificationOutbox = options.outboxWorker ? nextData._notificationOutbox : enqueueNotificationEvents(current, nextData);
  const next = normalizeDatabase({
    ...nextData,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    revision: current.revision + 1,
    createdAt: current.createdAt,
    updatedAt: now,
  });
  const transportBytes = workspaceTransportBytes(workspaceCoreData(next), next.revision);
  if (transportBytes > WORKSPACE_TRANSPORT_MAX_BYTES) throw new WorkspaceSizeError(transportBytes);
  for (const name of DOCUMENT_NAMES) {
    const bytes = workspaceTransportBytes(workspaceDocumentData(name, next), Number(next._documentRevisions?.[name]?.revision || 0));
    if (bytes > WORKSPACE_TRANSPORT_MAX_BYTES) throw new WorkspaceSizeError(bytes);
  }
  const storage = getStorageProvider();
  await options.coordination?.assertOwnership?.();
  try {
    await storage.saveDatabase(next, { expectedEtag: storageVersion(current) });
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
      return withRedisLock('smena:workspace:write:v1', async coordination => {
        await reloadWorkspaceStore();
        return mutateInsideLock(mutator, expectedRevision, { ...options, role: options.role || 'admin', coordination });
      });
    }
    if (!directDriveWritesEnabled()) {
      throw new WorkspaceCoordinationError('Workspace writes are not enabled for this deployment.');
    }
    const result = localWriteQueue.then(async () => {
      await reloadWorkspaceStore();
      return mutateInsideLock(mutator, expectedRevision, { ...options, role: options.role || 'admin' });
    });
    localWriteQueue = result.catch(() => undefined);
    return result;
  }

  const result = localWriteQueue.then(() => mutateInsideLock(mutator, expectedRevision, { ...options, role: options.role || 'admin' }));
  localWriteQueue = result.catch(() => undefined);
  return result;
}

export async function replaceWorkspaceDatabase(nextData, expectedRevision, options = {}) {
  if (!nextData || typeof nextData !== 'object' || Array.isArray(nextData)) {
    throw new TypeError('Workspace data must be a JSON object.');
  }
  return mutateWorkspaceDatabase(
    current => (options.client ? mergeClientWorkspace(current, nextData, options.role, options.actorMemberId) : { ...current, ...nextData }),
    expectedRevision,
    options,
  );
}

export async function getWorkspaceStatus() {
  const data = await initWorkspaceStore();
  const storage = getStorageProvider();
  const documentSnapshots = Object.fromEntries(await Promise.all(DOCUMENT_NAMES.map(async name => [name, await getWorkspaceDocument(name, data)])));
  const redis = await getRedisHealth();
  const coordination = redis.configured
    ? { mode: 'redis-lock', healthy: redis.connected, latencyMs: redis.latencyMs }
    : process.env.VERCEL
      ? { mode: 'drive-etag', healthy: directDriveWritesEnabled(), latencyMs: null }
      : { mode: 'local-queue', healthy: true, latencyMs: null };
  return {
    storage: await storage.getStatus(),
    coordination,
    schemaVersion: data.schemaVersion,
    revision: data.revision,
    updatedAt: data.updatedAt,
    workspaceBytes:
      workspaceTransportBytes(workspaceCoreData(data), data.revision) +
      DOCUMENT_NAMES.reduce(
        (total, name) => total + workspaceTransportBytes(workspaceDocumentData(name, documentSnapshots[name]), documentSnapshots[name].revision),
        0,
      ),
    workspaceMaxBytes: WORKSPACE_TRANSPORT_MAX_BYTES * (DOCUMENT_NAMES.length + 1),
    documents: Object.fromEntries(
      DOCUMENT_NAMES.map(name => [
        name,
        {
          revision: documentSnapshots[name].revision,
          updatedAt: documentSnapshots[name].updatedAt,
          bytes: workspaceTransportBytes(workspaceDocumentData(name, documentSnapshots[name]), documentSnapshots[name].revision),
          maxBytes: WORKSPACE_TRANSPORT_MAX_BYTES,
        },
      ]),
    ),
  };
}

export function resetWorkspaceStore() {
  database = null;
  initializationPromise = null;
  reloadPromise = null;
  localWriteQueue = Promise.resolve();
  lastLoadedAt = 0;
  resetWorkspaceDocumentStore();
}
