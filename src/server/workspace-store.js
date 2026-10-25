import { getStorageProvider } from './storage/index.js';
import { getRedisHealth, hasSharedRedis, withRedisLock, WorkspaceCoordinationError } from './redis.js';
import { directDriveWritesEnabled } from './deployment-config.js';
import { restoreUnauthorizedChanges } from '../shared/workspace-permissions.js';
import { migrateLegacyWorkspaceBrand } from '../shared/workspace-brand.js';
import { migrateNotificationRecipients, reconcileWorkspaceNotifications } from '../shared/notification-model.js';
import { WORKSPACE_TRANSPORT_MAX_BYTES, workspaceCapacity, workspaceTransportBytes } from '../shared/workspace-size.js';
import { validateWorkspaceData, validateDocumentInput } from '../shared/workspace-schema.js';
import { DOCUMENT_NAMES, workspaceCoreData, workspaceDocumentData } from '../shared/workspace-documents.js';
import { getWorkspaceDocument, resetWorkspaceDocumentStore } from './workspace-document-store.js';
import { membershipAuditEntries, validateMembershipTransition } from '../shared/workspace-membership.js';
import { mergeClientWorkspace } from './workspace-policy.js';
import { sanitizeWorkspaceContent } from './content-security.js';
import { copyStorageVersion, storageVersion } from './storage/version-token.js';
import { migrateMilestoneIds } from '../shared/milestone-identity.js';
import { enqueueNotificationEvents } from './notification-outbox.js';
import { indexStoredFiles, physicalFileKey } from './file-registry.js';
import { applyEntityDefaults } from '../shared/workspace-defaults.js';
import { retainDetachedFile } from './file-retention.js';
import { assignCanonicalTaskKeys, validateTaskTransitions } from './task-integrity.js';
import { mergePortableWorkspace } from '../shared/portable-workspace.js';
import { migrateWorkspaceSchema } from '../shared/workspace-schema-migrations.js';
import { FILE_CATALOG_MAX_BYTES } from '../shared/file-catalog.js';
import { workspaceCapacities, fileStorageAccounting } from './file-capacity.js';
import { providerFailureCounters } from './provider-safety.js';
import { createCatalogReader } from './file-catalog-reader.js';
import { catalogQuery, currentCatalogUser } from './file-catalog-query.js';
import { memberForProfile } from '../shared/member-identity.js';
import { canReadProject, canEditProject } from '../shared/project-access.js';
import { queryGraph, validateGraphQuery } from './graph-query.js';
import { fileExportReadIds } from './file-export-read.js';
import { isDeepStrictEqual } from 'node:util';
import { filePatchIds, fileMetadataChanges } from './storage/catalog-file-write.js';
import { planFileMetadataPatch } from './file-metadata-patch.js';

export const CURRENT_SCHEMA_VERSION = 3;

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
  const migrated = migrateWorkspaceSchema(value, CURRENT_SCHEMA_VERSION);
  const normalized = { ...createEmptyDatabase(), ...migrated, schemaVersion: CURRENT_SCHEMA_VERSION };
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

export async function getWorkspaceDatabase(options = {}) {
  const storage = getStorageProvider();
  if ((options.fields || options.catalog === 'metadata') && typeof storage.loadDatabaseCore === 'function') {
    const stored = await storage.loadDatabaseCore({ identities: !options.fields || options.fields.includes('files') });
    const core = await loadAggregate(storage, stored);
    return clone(options.fields ? Object.fromEntries(options.fields.map(field => [field, core[field]])) : core);
  }
  if (process.env.VERCEL) await reloadWorkspaceStore({ maxAgeMs: 2_000 });
  else await initWorkspaceStore();
  return clone(options.fields ? Object.fromEntries(options.fields.map(field => [field, database[field]])) : database);
}

export async function getWorkspaceUploadSnapshot(physicalKey) {
  const storage = getStorageProvider();
  if (typeof storage.loadDatabaseUploadState !== 'function') return getWorkspaceDatabase();
  return clone(await loadAggregate(storage, await storage.loadDatabaseUploadState(physicalKey)));
}

// Trusted upload/retention commands, not arbitrary browser data. Mixed client
// snapshots continue through their existing merge/ACL/cascade machinery.
export async function mutateWorkspaceCatalogCommand(mutator, expectedRevision, options) {
  const storage = getStorageProvider();
  if (!options.demand || typeof storage.saveDatabaseFileDelta !== 'function')
    return options.tryOnly ? null : mutateWorkspaceDatabase(mutator, expectedRevision, options);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new TypeError('A non-negative expected revision is required.');
  return withWorkspaceWrite(async coordination => {
    let actor;
    const snapshot = await storage.loadDatabaseFilePatch(
      new Set(options.ids || []),
      async core => {
        if (core.revision !== expectedRevision) throw new RevisionConflictError(core.revision);
        if (!isDeepStrictEqual(core, await loadAggregate(storage, clone(core))) || !isDeepStrictEqual(core, assignCanonicalTaskKeys(core, clone(core))))
          return false;
        actor = currentCatalogUser(core, options.user);
        const member = memberForProfile(core, actor);
        const projects = options.project ? [options.project] : core.files.filter(file => options.ids?.includes(file.id)).map(file => file.project);
        if (
          !member ||
          !['admin', 'editor'].includes(actor.role) ||
          projects.some(
            id =>
              !canEditProject(
                core.projects.find(project => project.id === id),
                member.id,
                actor.role,
              ),
          )
        )
          throw Object.assign(new Error('You do not have access to this file.'), { code: 'FILE_FORBIDDEN', statusCode: 403 });
        return true;
      },
      { delta: true, project: options.project, physicalKey: options.physicalKey },
    );
    if (!snapshot) {
      if (options.tryOnly) return null;
      if (process.env.VERCEL) await reloadWorkspaceStore();
      return mutateInsideLock(mutator, expectedRevision, { ...options, coordination });
    }
    const current = { ...snapshot.data, files: snapshot.files };
    const changed = await mutator(clone(current), actor, snapshot.data);
    if (!changed && options.tryOnly) return null;
    const next = normalizeDatabase({ ...changed, revision: current.revision + 1, createdAt: current.createdAt, updatedAt: new Date().toISOString() });
    const originalIds = new Set(current.files.map(file => file.id));
    const nextIds = new Set(next.files.map(file => file.id));
    const targets = [...next.files.filter(file => !originalIds.has(file.id)), ...current.files.filter(file => !nextIds.has(file.id))];
    const memberId = memberForProfile(current, actor)?.id;
    if (
      targets.some(
        file =>
          !canEditProject(
            current.projects.find(project => project.id === file.project),
            memberId,
            actor.role,
          ) ||
          (options.project && file.project !== options.project) ||
          (options.physicalKey && !originalIds.has(file.id) && physicalFileKey(file) !== options.physicalKey),
      )
    )
      throw Object.assign(new Error('The file command changed its authorized target.'), { code: 'FILE_FORBIDDEN', statusCode: 403 });
    validateTaskTransitions(current, next);
    validateMembershipTransition(current, next);
    validateTransportSize(next, false);
    try {
      const result = await storage.saveDatabaseFileDelta(snapshot, next, () => coordination?.assertOwnership?.());
      database = null;
      lastLoadedAt = 0;
      return clone(result);
    } catch (error) {
      if (Number(error?.response?.status || error?.code) !== 412) throw error;
      database = null;
      lastLoadedAt = 0;
      const latest = await storage.loadDatabaseCore({ identities: false }).catch(() => null);
      throw new RevisionConflictError(Number(latest?.revision ?? current.revision));
    }
  });
}

const catalogReaders = new WeakMap();
export async function getWorkspaceFileCatalogPage(user, options) {
  const storage = getStorageProvider();
  if (!options.token && typeof storage.loadDatabaseCatalog === 'function') {
    const data = await storage.loadDatabaseCatalog(core => catalogReadScope(core, user, options.project, options.ids));
    if (!data) throw new Error('The configured storage does not contain a workspace database.');
    return createCatalogReader(data)(user, options);
  }
  if (process.env.VERCEL) await reloadWorkspaceStore({ maxAgeMs: 2000 });
  else await initWorkspaceStore();
  let read = catalogReaders.get(database);
  if (!read) {
    read = createCatalogReader(database);
    catalogReaders.set(database, read);
  }
  return read(user, options);
}

export async function queryWorkspaceFileCatalog(user, options) {
  const storage = getStorageProvider();
  const loadIndex = storage.loadDatabaseCatalogIndex || storage.loadDatabaseCatalog;
  if (typeof loadIndex === 'function') {
    const data = await loadIndex.call(storage, core =>
      catalogReadScope(core, user, options.context !== 'all' && options.context ? options.context : options.project),
    );
    if (!data) throw new Error('The configured storage does not contain a workspace database.');
    return catalogQuery(data, user, options);
  }
  if (process.env.VERCEL) await reloadWorkspaceStore({ maxAgeMs: 2000 });
  else await initWorkspaceStore();
  return catalogQuery(database, user, options);
}

function catalogReadScope(data, user, project = 'all', ids) {
  user = currentCatalogUser(data, user);
  const member = memberForProfile(data, user)?.id || user.id;
  return {
    projects: new Set(data.projects.filter(p => (project === 'all' || p.id === project) && canReadProject(p, member, user.role)).map(p => p.id)),
    ...(ids ? { ids: new Set(ids) } : {}),
  };
}

export async function queryWorkspaceGraph(user, input) {
  const options = validateGraphQuery(input);
  const storage = getStorageProvider();
  if (typeof storage.loadDatabaseCatalogIndex === 'function') {
    // Typed non-file candidates need no catalog parts at all, except when the
    // source itself is a file (its write access must be checked on real data).
    const needsFiles =
      options.mode !== 'candidates' || ((!options.kind || options.kind === 'file') && !options.wikiOnly) || options.source?.startsWith('file:');
    const stored = needsFiles ? await storage.loadDatabaseCatalogIndex(core => catalogReadScope(core, user)) : await storage.loadDatabaseCore();
    if (!stored) throw new Error('The configured storage does not contain a workspace database.');
    return queryGraph(await loadAggregate(storage, stored), user, options);
  }
  if (process.env.VERCEL) await reloadWorkspaceStore({ maxAgeMs: 2000 });
  else await initWorkspaceStore();
  return queryGraph(database, user, options);
}

export async function getWorkspaceFilesSnapshot(user, ids) {
  if (!Array.isArray(ids) || ids.length > 500 || ids.some(id => typeof id !== 'string' || !id)) throw new TypeError('Invalid file selection.');
  const storage = getStorageProvider();
  const selected = new Set(ids);
  if (typeof storage.loadDatabaseCatalog === 'function') {
    const data = await storage.loadDatabaseCatalog(core => catalogReadScope(core, user, 'all', ids));
    if (!data) throw new Error('The configured storage does not contain a workspace database.');
    data.files = data.files.filter(file => selected.has(file.id));
    return data;
  }
  const data = await getWorkspaceDatabase();
  return { ...data, files: data.files.filter(file => selected.has(file.id)) };
}

export async function getWorkspaceFileSnapshot(user, id) {
  return getWorkspaceFilesSnapshot(user, [id]);
}

export async function getWorkspaceExportSnapshot(user, id) {
  const storage = getStorageProvider();
  if (typeof storage.loadDatabaseCatalog === 'function') {
    const data = await storage.loadDatabaseCatalog(core => catalogReadScope(core, user, 'all', fileExportReadIds(core, user, id)));
    if (!data) throw new Error('The configured storage does not contain a workspace database.');
    return data;
  }
  return getWorkspaceDatabase();
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
  // A recovery point must describe a fresh, complete root, not the two-second
  // UI read cache or a catalog metadata projection.
  const storage = getStorageProvider();
  // Capture the complete snapshot before awaiting: another request may replace
  // the worker cache while the provider checks the root's exact ETag.
  const baseline = database;
  if (process.env.VERCEL && !baseline && typeof storage.createColdDatabaseBackup === 'function') {
    const backup = await storage.createColdDatabaseBackup(label, async core => isDeepStrictEqual(core, await loadAggregate(storage, clone(core))));
    if (backup) return backup;
  }
  let current;
  if (process.env.VERCEL && typeof storage.loadDatabaseForBackup === 'function') {
    const loaded = await storage.loadDatabaseForBackup(storageVersion(baseline));
    if (loaded.unchanged && baseline) current = baseline;
    else {
      if (loaded.unchanged) throw new Error('A complete backup baseline is missing.');
      if (!loaded.data) throw new Error('The workspace backup source is missing.');
      current = await loadAggregate(storage, loaded.data);
    }
  } else current = process.env.VERCEL ? await reloadWorkspaceStore() : await initWorkspaceStore();
  return backupSnapshot(current, label);
}

async function backupSnapshot(current, label) {
  const storage = getStorageProvider();
  if (typeof storage.createDatabaseBackup !== 'function') throw new Error('Workspace backups are not supported by the configured storage.');
  return storage.createDatabaseBackup(clone(current), label);
}

export async function listWorkspaceBackups() {
  const storage = getStorageProvider();
  if (typeof storage.listDatabaseBackups !== 'function') return [];
  return storage.listDatabaseBackups();
}

export async function importPortableWorkspace(payload, expectedRevision, conflictPolicy = 'copy') {
  if (!['copy', 'skip'].includes(conflictPolicy)) throw new TypeError('Invalid import conflict policy.');
  let backup;
  let counts;
  let report;
  const data = await mutateWorkspaceDatabase(
    async database => {
      const result = mergePortableWorkspace(database, payload, { conflictPolicy });
      for (const name of DOCUMENT_NAMES) validateDocumentInput(name, workspaceDocumentData(name, result.data));
      backup = await backupSnapshot(database, 'Before portable import');
      counts = result.counts;
      report = result.report;
      database.relations = result.data.relations;
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
  const normalizedBackup = normalizeDatabase(backup);
  return replaceWorkspaceDatabase(normalizedBackup, expectedRevision, { role: 'admin', replaceDocuments: true, backupLabel: 'Before restore' });
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
  validateTransportSize(next);
  const storage = getStorageProvider();
  await options.coordination?.assertOwnership?.();
  if (options.backupLabel) {
    // Snapshot the exact canonical revision being replaced. Failure stops the
    // write; no additional catalog reload can change the recovery baseline.
    await backupSnapshot(current, options.backupLabel);
    await options.coordination?.assertOwnership?.();
  }
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

function validateTransportSize(next, canonicalCatalog = true) {
  const { files, ...core } = workspaceCoreData(next);
  const transportBytes = workspaceTransportBytes(core, next.revision);
  if (transportBytes > WORKSPACE_TRANSPORT_MAX_BYTES) throw new WorkspaceSizeError(transportBytes);
  if (canonicalCatalog && workspaceTransportBytes({ files }, next.revision) > FILE_CATALOG_MAX_BYTES)
    throw new WorkspaceSizeError(workspaceTransportBytes({ files }, next.revision));
  for (const name of DOCUMENT_NAMES) {
    const bytes = workspaceTransportBytes(workspaceDocumentData(name, next), Number(next._documentRevisions?.[name]?.revision || 0));
    if (bytes > WORKSPACE_TRANSPORT_MAX_BYTES) throw new WorkspaceSizeError(bytes);
  }
}

export async function mutateWorkspaceDatabase(mutator, expectedRevision, options = {}) {
  if (typeof mutator !== 'function') throw new TypeError('A workspace mutation function is required.');
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    throw new TypeError('A non-negative expected revision is required.');
  }

  return withWorkspaceWrite(async coordination => {
    if (process.env.VERCEL) await reloadWorkspaceStore();
    return mutateInsideLock(mutator, expectedRevision, { ...options, role: options.role || 'admin', coordination });
  });
}

async function withWorkspaceWrite(operation) {
  if (process.env.VERCEL) {
    if (hasSharedRedis()) {
      return withRedisLock('smena:workspace:write:v1', operation);
    }
    if (!directDriveWritesEnabled()) {
      throw new WorkspaceCoordinationError('Workspace writes are not enabled for this deployment.');
    }
  }
  const result = localWriteQueue.then(() => operation(null));
  localWriteQueue = result.catch(() => undefined);
  return result;
}

export async function mutateWorkspaceMetadata(mutator, expectedRevision, options = {}) {
  if (typeof mutator !== 'function' || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
    throw new TypeError('A mutation function and a non-negative expected revision are required.');
  if (![...DOCUMENT_NAMES, 'preferences'].includes(options.scope) || options.backupLabel || options.replaceDocuments || options.actorMemberId)
    throw new TypeError('Invalid metadata-only mutation scope.');
  const storage = getStorageProvider();
  if (typeof storage.loadDatabaseMetadata !== 'function' || typeof storage.saveDatabaseMetadata !== 'function')
    return mutateWorkspaceDatabase(mutator, expectedRevision, options);
  return withWorkspaceWrite(async coordination => {
    const baseline = await storage.loadDatabaseMetadata();
    const current = baseline && (await loadAggregate(storage, clone(baseline)));
    // Legacy/migration side effects require complete validation and reindexing.
    // Never install an empty/identity-only catalog as a canonical cache entry.
    if (!current || !isDeepStrictEqual(current, baseline)) {
      if (process.env.VERCEL) await reloadWorkspaceStore();
      return mutateInsideLock(mutator, expectedRevision, { ...options, role: options.role || 'admin', coordination });
    }
    if (current.revision !== expectedRevision) throw new RevisionConflictError(current.revision);
    const changed = await mutator(clone(current));
    if (!changed || typeof changed !== 'object' || Array.isArray(changed)) throw new TypeError('Workspace mutation must return a JSON object.');
    const next = normalizeDatabase({ ...changed, revision: current.revision + 1, createdAt: current.createdAt, updatedAt: new Date().toISOString() });
    validateMembershipTransition(current, next);
    // Catalog bytes are checked exactly by the provider's immutable-root patch;
    // computing them from the intentionally absent file rows would be wrong.
    validateTransportSize(next, false);
    await coordination?.assertOwnership?.();
    try {
      const result = await storage.saveDatabaseMetadata(next, baseline, { scope: options.scope, memberId: options.memberId });
      database = null;
      lastLoadedAt = 0;
      return clone(result);
    } catch (error) {
      if (Number(error?.response?.status || error?.code) !== 412) throw error;
      database = null;
      lastLoadedAt = 0;
      const latest = await storage.loadDatabaseCore({ identities: false }).catch(() => null);
      throw new RevisionConflictError(Number(latest?.revision ?? current.revision));
    }
  });
}

// Returns null only when the operation requires the existing canonical path.
// A partial catalog is never installed in the worker's complete database cache.
export async function tryMutateWorkspaceFiles(incoming, changes, expectedRevision, user, profiles = []) {
  const ids = filePatchIds(changes);
  const storage = getStorageProvider();
  if (!ids || typeof storage.loadDatabaseFilePatch !== 'function' || typeof storage.saveDatabaseFilePatch !== 'function') return null;
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new TypeError('A non-negative expected revision is required.');
  return withWorkspaceWrite(async coordination => {
    let plan;
    const snapshot = await storage.loadDatabaseFilePatch(ids, async core => {
      if (core.revision !== expectedRevision) throw new RevisionConflictError(core.revision);
      // Migrations, sanitation or registry repairs require full canonical rows.
      if (!isDeepStrictEqual(core, await loadAggregate(storage, clone(core)))) return false;
      const keyed = assignCanonicalTaskKeys(core, clone(core));
      if (!isDeepStrictEqual(core, keyed)) return false;
      plan = planFileMetadataPatch(core, incoming, changes, user, profiles);
      return !!plan;
    });
    if (!snapshot) return null;
    const updates = new Map(changes.upsert.map(file => [file.id, file]));
    const files = snapshot.files.map(file => updates.get(file.id) || file);
    if (snapshot.files.some((file, index) => !fileMetadataChanges(file, files[index]))) return null;
    const updatedAt = new Date().toISOString();
    const next = { ...snapshot.data, files, tasks: plan.tasks, revision: snapshot.data.revision + 1, updatedAt };
    validateTaskTransitions(snapshot.data, next);
    validateMembershipTransition(snapshot.data, next);
    if (!isDeepStrictEqual(next, normalizeDatabase(clone(next)))) return null;
    validateTransportSize(next, false);
    try {
      const result = await storage.saveDatabaseFilePatch(snapshot, files, plan.tasks, next.revision, updatedAt, () => coordination?.assertOwnership?.());
      database = null;
      lastLoadedAt = 0;
      return clone(result);
    } catch (error) {
      if (Number(error?.response?.status || error?.code) !== 412) throw error;
      database = null;
      lastLoadedAt = 0;
      const latest = await storage.loadDatabaseCore({ identities: false }).catch(() => null);
      throw new RevisionConflictError(Number(latest?.revision ?? snapshot.data.revision));
    }
  });
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
  const storage = getStorageProvider();
  let snapshot;
  if (typeof storage.loadDatabaseStatus === 'function') {
    snapshot = await storage.loadDatabaseStatus();
    if (!snapshot) throw new Error('The configured storage does not contain a workspace database.');
  }
  // A status read must neither reuse a stale worker database nor install an
  // identity-only catalog as the next mutation's canonical baseline.
  const data = snapshot ? await loadAggregate(storage, snapshot.data) : await getWorkspaceDatabase();
  const documentSnapshots = Object.fromEntries(await Promise.all(DOCUMENT_NAMES.map(async name => [name, await getWorkspaceDocument(name, data)])));
  const redis = await getRedisHealth();
  const coordination = redis.configured
    ? { mode: 'redis-lock', healthy: redis.connected, latencyMs: redis.latencyMs }
    : process.env.VERCEL
      ? { mode: 'drive-etag', healthy: directDriveWritesEnabled(), latencyMs: null }
      : { mode: 'local-queue', healthy: true, latencyMs: null };
  const capacities = workspaceCapacities(data, documentSnapshots, snapshot?.accounting?.catalogBytes);
  const workspaceBytes = Object.values(capacities).reduce((total, item) => total + item.bytes, 0);
  const workspaceMaxBytes = Object.values(capacities).reduce((total, item) => total + item.maxBytes, 0);
  const storageStatus = await storage.getStatus();
  if (snapshot?.catalog) storageStatus.fileCatalog = snapshot.catalog;
  return {
    storage: storageStatus,
    coordination,
    schemaVersion: data.schemaVersion,
    revision: data.revision,
    updatedAt: data.updatedAt,
    workspaceBytes,
    workspaceMaxBytes,
    workspaceCapacity: workspaceCapacity(workspaceBytes, workspaceMaxBytes),
    capacities,
    fileStorage: snapshot?.accounting?.fileStorage || fileStorageAccounting(data),
    catalogAccounting: { source: snapshot?.accounting ? 'manifest' : 'canonical', revision: data.revision },
    providerFailures: providerFailureCounters(),
    workspaceWarningBytes: Object.values(capacities).reduce((total, item) => total + item.warningBytes, 0),
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
