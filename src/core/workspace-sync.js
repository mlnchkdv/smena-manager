import { putWorkspace, putWorkspaceDocument } from './api.js';
import { DOCUMENT_NAMES, workspaceCoreData, workspaceDocumentData } from '../shared/workspace-documents.js';
import { workspacePayload } from './workspace-snapshot.js';
import { mergeWorkspaceData } from '../shared/workspace-merge.js';

function browserNotify(detail) {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  window.dispatchEvent(new CustomEvent('smena:sync-status', { detail }));
}

export function createWorkspaceSync(options = {}) {
  const writeWorkspace = options.writeWorkspace || putWorkspace;
  const notify = options.notify || browserNotify;
  const schedule = options.schedule || setTimeout;
  const cancel = options.cancel || clearTimeout;
  let revision = 0;
  let enabled = false;
  let pending = null;
  let activePromise = null;
  let retryTimer = null;
  let retryDelay = 1_000;
  let confirmedHash = null;
  let confirmedData = null;
  let pendingHash = null;
  let activeHash = null;
  let conflict = null;
  let generation = 0;
  let lastError = null;

  function configure(nextRevision, role, data) {
    generation += 1;
    activePromise = null;
    lastError = null;
    revision = Number(nextRevision || 0);
    enabled = role === 'admin' || role === 'editor';
    pending = null;
    retryDelay = 1_000;
    confirmedHash = data ? JSON.stringify(data) : null;
    confirmedData = data ? structuredClone(data) : null;
    pendingHash = null;
    activeHash = null;
    conflict = null;
    if (retryTimer) cancel(retryTimer);
    retryTimer = null;
  }

  function disable() {
    generation += 1;
    activePromise = null;
    lastError = null;
    enabled = false;
    pending = null;
    pendingHash = null;
    activeHash = null;
    conflict = null;
    if (retryTimer) cancel(retryTimer);
    retryTimer = null;
  }

  function scheduleRetry() {
    if (retryTimer || !enabled) return;
    retryTimer = schedule(() => {
      retryTimer = null;
      void flush();
    }, retryDelay);
    retryDelay = Math.min(retryDelay * 2, 30_000);
  }

  function flush() {
    if (activePromise) return activePromise;
    if (!enabled || !pending || retryTimer) return Promise.resolve();
    const data = pending;
    const writeGeneration = generation;
    const dataHash = pendingHash;
    pending = null;
    pendingHash = null;
    activeHash = dataHash;
    notify({ status: 'syncing', revision });
    activePromise = (async () => {
      try {
        const snapshot = await writeWorkspace(data, revision);
        if (writeGeneration !== generation) return;
        revision = Number(snapshot.revision);
        const canonical = workspacePayload(snapshot);
        confirmedHash = JSON.stringify(canonical);
        confirmedData = structuredClone(canonical);
        if (pending) {
          const merged = mergeWorkspaceData(data, pending, canonical);
          if (merged.conflicts.length) {
            enabled = false;
            conflict = { base: structuredClone(data), local: structuredClone(pending), revision, currentRevision: revision };
            pending = null;
            pendingHash = null;
            lastError = 'conflict';
            notify({ status: 'conflict', revision, currentRevision: revision });
            return;
          }
          pending = merged.data;
          pendingHash = JSON.stringify(pending);
          if (pendingHash === confirmedHash) pending = pendingHash = null;
        }
        lastError = null;
        retryDelay = 1_000;
        notify({ status: 'saved', revision, data: structuredClone(canonical), sentData: structuredClone(data) });
      } catch (error) {
        if (writeGeneration !== generation) return;
        lastError =
          error.status === 409 || error.code === 'REVISION_CONFLICT'
            ? 'conflict'
            : error.status === 401
              ? 'unauthorized'
              : error.status === 403
                ? 'forbidden'
                : error.status === 413
                  ? 'too_large'
                  : error.status === 400
                    ? 'invalid'
                    : !error.status || error.code === 'NETWORK_ERROR'
                      ? 'offline'
                      : 'unavailable';
        if (error.status === 409 || error.code === 'REVISION_CONFLICT') {
          enabled = false;
          const latestLocal = pending || data;
          conflict = {
            base: confirmedData ? structuredClone(confirmedData) : null,
            local: structuredClone(latestLocal),
            revision,
            currentRevision: Number(error.currentRevision || revision),
          };
          pending = null;
          pendingHash = null;
          notify({ status: 'conflict', revision, currentRevision: error.currentRevision, error });
        } else if (error.status === 401) {
          enabled = false;
          notify({ status: 'unauthorized', error });
        } else if (error.status === 403) {
          enabled = false;
          notify({ status: 'forbidden', error });
        } else if (error.status === 413 || error.code === 'WORKSPACE_TOO_LARGE') {
          notify({ status: 'too_large', error });
        } else if (error.status === 400 || error.code === 'WORKSPACE_INVALID') {
          enabled = false;
          notify({ status: 'invalid', error });
        } else if (!error.status || error.code === 'NETWORK_ERROR') {
          if (!pending) {
            pending = data;
            pendingHash = dataHash;
          }
          notify({ status: 'offline', error });
          scheduleRetry();
        } else {
          if (!pending) {
            pending = data;
            pendingHash = dataHash;
          }
          notify({ status: 'unavailable', error });
          scheduleRetry();
        }
      } finally {
        if (writeGeneration === generation) {
          activeHash = null;
          activePromise = null;
          if (enabled && pending && !retryTimer) queueMicrotask(() => void flush());
        }
      }
    })();
    return activePromise;
  }

  function queue(data) {
    if (!enabled) return Promise.resolve();
    const dataHash = JSON.stringify(data);
    if (dataHash === activeHash) {
      pending = pendingHash = null;
      return activePromise || Promise.resolve();
    }
    if (dataHash === pendingHash || (!activePromise && !pending && dataHash === confirmedHash)) return activePromise || Promise.resolve();
    pending = structuredClone(data);
    pendingHash = dataHash;
    return flush();
  }

  function retry() {
    if (retryTimer) cancel(retryTimer);
    retryTimer = null;
    return flush();
  }

  function state() {
    return { enabled, revision, hasPending: !!pending, hasActive: !!activePromise, hasConflict: !!conflict, lastError, retryDelay };
  }

  function isClean(data) {
    return !pending && !activePromise && !conflict && !lastError && confirmedHash !== null && JSON.stringify(data) === confirmedHash;
  }

  function getConflict() {
    return conflict ? structuredClone(conflict) : null;
  }

  return { configure, disable, queue, retry, state, isClean, getConflict };
}

const workspaceSync = createWorkspaceSync();
const documentSyncs = Object.fromEntries(
  DOCUMENT_NAMES.map(name => [
    name,
    createWorkspaceSync({
      writeWorkspace: (data, revision) => putWorkspaceDocument(name, data, revision),
      notify: detail => browserNotify({ ...detail, scope: name }),
    }),
  ]),
);

export function configureWorkspaceSync(revision, role, data, documentSnapshots = {}) {
  workspaceSync.configure(revision, role, workspaceCoreData(data));
  for (const name of DOCUMENT_NAMES) {
    documentSyncs[name].configure(documentSnapshots[name]?.revision || 0, role, workspaceDocumentData(name, data));
  }
}
export function configureCoreWorkspaceSync(revision, role, data) {
  workspaceSync.configure(revision, role, workspaceCoreData(data));
}
export function disableWorkspaceSync() {
  workspaceSync.disable();
  for (const sync of Object.values(documentSyncs)) sync.disable();
}
export function queueWorkspaceSync(data) {
  return Promise.all([
    workspaceSync.queue(workspaceCoreData(data)),
    ...DOCUMENT_NAMES.map(name => documentSyncs[name].queue(workspaceDocumentData(name, data))),
  ]);
}
export function retryWorkspaceSync() {
  return Promise.all([workspaceSync.retry(), ...Object.values(documentSyncs).map(sync => sync.retry())]);
}
export function workspaceSyncState() {
  const core = workspaceSync.state();
  const shards = Object.fromEntries(DOCUMENT_NAMES.map(name => [name, documentSyncs[name].state()]));
  return {
    ...core,
    hasPending: core.hasPending || Object.values(shards).some(state => state.hasPending),
    hasActive: core.hasActive || Object.values(shards).some(state => state.hasActive),
    hasConflict: core.hasConflict || Object.values(shards).some(state => state.hasConflict),
    errors: Object.fromEntries(
      [['workspace', core], ...Object.entries(shards)].filter(([, state]) => state.lastError).map(([scope, state]) => [scope, state.lastError]),
    ),
    documents: shards,
  };
}
export function workspaceSyncIsClean(data) {
  return workspaceSync.isClean(workspaceCoreData(data)) && DOCUMENT_NAMES.every(name => documentSyncs[name].isClean(workspaceDocumentData(name, data)));
}
export function workspaceSyncConflict() {
  const core = workspaceSync.getConflict();
  if (core) return { ...core, scope: 'workspace' };
  for (const name of DOCUMENT_NAMES) {
    const conflict = documentSyncs[name].getConflict();
    if (conflict) return { ...conflict, scope: name };
  }
  return null;
}
