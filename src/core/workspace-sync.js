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

  function configure(nextRevision, role) {
    revision = Number(nextRevision || 0);
    enabled = role === 'admin' || role === 'editor';
    pending = null;
    retryDelay = 1_000;
    if (retryTimer) cancel(retryTimer);
    retryTimer = null;
  }

  function disable() {
    enabled = false;
    pending = null;
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
    pending = null;
    notify({ status: 'syncing', revision });
    activePromise = (async () => {
      try {
        const snapshot = await writeWorkspace(data, revision);
        revision = Number(snapshot.revision);
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
        } else {
          if (!pending) pending = data;
          notify({ status: 'offline', error });
          scheduleRetry();
        }
      } finally {
        activePromise = null;
        if (enabled && pending && !retryTimer) queueMicrotask(() => void flush());
      }
    })();
    return activePromise;
  }

  function queue(data) {
    if (!enabled) return Promise.resolve();
    pending = structuredClone(data);
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

export const configureWorkspaceSync = (revision, role) => workspaceSync.configure(revision, role);
export const disableWorkspaceSync = () => workspaceSync.disable();
export const queueWorkspaceSync = data => workspaceSync.queue(data);
export const retryWorkspaceSync = () => workspaceSync.retry();
export const workspaceSyncState = () => workspaceSync.state();
