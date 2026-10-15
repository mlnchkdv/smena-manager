import { putWorkspace } from './api.js';

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
  let pendingHash = null;
  let activeHash = null;

  function configure(nextRevision, role, data) {
    revision = Number(nextRevision || 0);
    enabled = role === 'admin' || role === 'editor';
    pending = null;
    retryDelay = 1_000;
    confirmedHash = data ? JSON.stringify(data) : null;
    pendingHash = null;
    activeHash = null;
    if (retryTimer) cancel(retryTimer);
    retryTimer = null;
  }

  function disable() {
    enabled = false;
    pending = null;
    pendingHash = null;
    activeHash = null;
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
    const dataHash = pendingHash;
    pending = null;
    pendingHash = null;
    activeHash = dataHash;
    notify({ status: 'syncing', revision });
    activePromise = (async () => {
      try {
        const snapshot = await writeWorkspace(data, revision);
        revision = Number(snapshot.revision);
        confirmedHash = dataHash;
        retryDelay = 1_000;
        notify({ status: 'saved', revision });
      } catch (error) {
        if (error.status === 409 || error.code === 'REVISION_CONFLICT') {
          enabled = false;
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
        } else {
          if (!pending) {
            pending = data;
            pendingHash = dataHash;
          }
          notify({ status: 'offline', error });
          scheduleRetry();
        }
      } finally {
        activeHash = null;
        activePromise = null;
        if (enabled && pending && !retryTimer) queueMicrotask(() => void flush());
      }
    })();
    return activePromise;
  }

  function queue(data) {
    if (!enabled) return Promise.resolve();
    const dataHash = JSON.stringify(data);
    if (dataHash === confirmedHash || dataHash === pendingHash || dataHash === activeHash) return activePromise || Promise.resolve();
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
    return { enabled, revision, hasPending: !!pending, retryDelay };
  }

  return { configure, disable, queue, retry, state };
}

const workspaceSync = createWorkspaceSync();

export const configureWorkspaceSync = (revision, role, data) => workspaceSync.configure(revision, role, data);
export const disableWorkspaceSync = () => workspaceSync.disable();
export const queueWorkspaceSync = data => workspaceSync.queue(data);
export const retryWorkspaceSync = () => workspaceSync.retry();
export const workspaceSyncState = () => workspaceSync.state();
