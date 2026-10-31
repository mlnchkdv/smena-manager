/* =====================================================================
   ENTRY: styles, then every module in dependency order (several register
   global listeners or add handlers to the action table when they load), then boot.
   ===================================================================== */
import './styles/index.css';
import './core/utils.js';
import './core/icons.js';
import './core/constants.js';
import './data/seed.js';
import './core/store.js';
import './core/i18n.js';
import './ui/helpers.js';
import './core/theme.js';
import './ui/toast.js';
import './ui/select.js';
import './shell/render.js';
import './shell/layout.js';
import './shell/skeletons.js';
import './shell/view-engine.js';
import './components/task-list.js';
import './overlays/drawer.js';
import './overlays/modals.js';
import './overlays/popovers.js';
import './overlays/context-menu.js';
import './pages/auth.js';
import './actions/actions.js';
import './actions/events.js';
import './actions/keyboard.js';
import './actions/drag-drop.js';
import './features/teams.js';
import './features/subtasks.js';
import './actions/teams.js';
import './actions/subtasks.js';
import './actions/archive.js';
import './features/knowledge.js';
import { S, D, myNotificationPreferences, myNotifications, setWorkspaceBaseline } from './core/store.js';
import { A } from './actions/actions.js';
import { retryOverlays } from './overlays/drawer.js';
import { restoreDeploymentContext } from './core/deployment-context.js';
import { ROUTE_NAMES, render, go } from './shell/render.js';
import { recoverWorkspaceConflict, refreshWorkspaceFromServer, restoreSessionAndWorkspace } from './core/bootstrap.js';
import { toast } from './ui/toast.js';
import { parseAppLocation, resolveAppLocation } from './shared/app-location.js';
import { deliverBrowserNotification } from './core/browser-notifications.js';
import { t as tr, isRussian } from './core/i18n.js';
import { syncWebPushSubscription } from './core/push-subscriptions.js';
import { disableWorkspaceSync, retryWorkspaceSync, workspaceSyncIsClean, workspaceSyncState } from './core/workspace-sync.js';
import { pollConnectionFlags, workspaceRefreshDelay } from './core/workspace-refresh.js';
import { clearSession, getActiveWorkspace, getNotificationDeliveryStatus, SESSION_STORAGE_KEY } from './core/api.js';
import { mergeWorkspaceData } from './shared/workspace-merge.js';
import { DOCUMENT_NAMES, workspaceCoreData, workspaceDocumentData } from './shared/workspace-documents.js';
import { TODAY, iso, updateToday, fmtTimestamp } from './core/utils.js';
import { createPollCoordinator } from './core/poll-coordinator.js';
import { retryPersonalPreferences } from './core/personal-preferences.js';

void import('./core/deployment-recovery.js').then(module => module.installDeploymentRecovery(__SMENA_BUILD_ID__));
A.retryOverlays = retryOverlays;

window.addEventListener('smena:page-module-ready', event => {
  if (event.detail?.route === S.ui.route) render();
});
window.addEventListener('smena:deployment-version', () => render());

let conflictRecoveryPromise = null;
setInterval(() => {
  const before = iso(TODAY);
  updateToday(S.prefs.tz);
  if (before !== iso(TODAY) && !S.ui.auth) render();
}, 60000);
let pushSyncPromise = null;
const refreshChannel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('smena:workspace:v2') : null;
let pollStorage;
try {
  pollStorage = localStorage;
} catch {
  // Private browser modes may block storage; independent polling remains safe.
}
const pollCoordinator = createPollCoordinator({ locks: refreshChannel ? navigator.locks : null, storage: pollStorage });
const workspaceFingerprint = () =>
  JSON.stringify([S.ui.currentUser?.role, S.ui.workspaceRevision, ...DOCUMENT_NAMES.map(name => S.ui.documentRevisions?.[name] || 0)]);
let refreshAnnouncementTimer = null;

function announceWorkspaceChange() {
  if (!refreshChannel) return;
  clearTimeout(refreshAnnouncementTimer);
  refreshAnnouncementTimer = setTimeout(() => {
    refreshChannel.postMessage({ type: 'workspace-saved', owner: S.ui.currentUser?.id, workspace: getActiveWorkspace(), at: Date.now() });
  }, 80);
}

async function refreshWebPushSubscription() {
  if (S.ui.auth || !S.ui.currentUser || pushSyncPromise) return pushSyncPromise;
  S.ui.pushState = 'checking';
  pushSyncPromise = syncWebPushSubscription(myNotificationPreferences())
    .then(async state => {
      S.ui.pushState = state;
      if (S.ui.currentUser?.role === 'admin') {
        S.ui.notificationDeliveryStatus = await getNotificationDeliveryStatus().catch(() => S.ui.notificationDeliveryStatus);
      }
      if (S.ui.route === 'settings' && S.ui.params.sec === 'notif-push') render();
      return state;
    })
    .catch(error => {
      S.ui.pushState = 'error';
      console.error('[Push] Subscription synchronization failed:', error);
      if (S.ui.route === 'settings' && S.ui.params.sec === 'notif-push') render();
      return 'error';
    })
    .finally(() => {
      pushSyncPromise = null;
    });
  return pushSyncPromise;
}

function updateSyncIndicator(status) {
  S.ui.syncState = status;
  if (['saved', 'syncing'].includes(status)) {
    if (S.ui.personalSyncState === 'offline') status = 'offline';
    else if (['unavailable', 'invalid'].includes(S.ui.personalSyncState)) status = 'unavailable';
    else if (S.ui.personalSyncState === 'syncing') status = 'syncing';
  }
  const indicator = document.getElementById('sync-indicator');
  if (!indicator) return;
  const labels = {
    syncing: 'Saving…',
    saved: 'Saved',
    offline: 'Offline',
    unavailable: 'Service unavailable',
    conflict: 'Conflict',
    too_large: 'Limit exceeded',
    invalid: 'Data error',
  };
  indicator.dataset.state = status;
  const draftLabel = status === 'saved' && S.ui.workspaceSettingsDirty ? (isRussian() ? 'Есть несохранённые изменения' : 'Unsaved changes') : '';
  document.querySelectorAll('.account-avatar-status').forEach(avatar => {
    avatar.dataset.state = status;
  });
  document.querySelectorAll('.account-menu-trigger').forEach(trigger => {
    trigger.setAttribute('aria-label', `${tr('Account menu')}. ${draftLabel || tr(labels[status] || labels.saved)}`);
  });
  const label = indicator.querySelector('.sync-label');
  if (label) label.textContent = draftLabel || tr(labels[status] || labels.saved);
  indicator.title =
    draftLabel ||
    (status === 'saved' ? `${tr('Last synchronized')}: ${fmtTimestamp(S.ui.lastSyncedAt || Date.now(), true)}` : tr(labels[status] || labels.saved));
}
window.addEventListener('smena:workspace-settings-draft', () => updateSyncIndicator(S.ui.syncState || 'saved'));

async function handleWorkspaceConflict() {
  if (conflictRecoveryPromise) return conflictRecoveryPromise;
  // Core and knowledge documents share the Drive aggregate. Finish sibling
  // writes before reading its revision, otherwise our own write can race the merge.
  conflictRecoveryPromise = retryWorkspaceSync()
    .then(() => recoverWorkspaceConflict())
    .then(result => {
      if (result.status === 'merged') {
        S.ui.syncConflict = workspaceSyncState().hasConflict;
        if (S.ui.syncConflict) setTimeout(() => void handleWorkspaceConflict(), 0);
        render();
        toast('Changes from both sessions were safely merged.');
      } else if (result.status === 'manual') {
        S.ui.syncConflict = true;
        render();
        toast('The same data changed in two sessions. Your version was saved as a recovery copy in this browser.', {
          kind: 'err',
          ms: 15_000,
          action: 'Review conflict',
          onAction: () => A.reviewSyncConflict(),
        });
      }
      return result;
    })
    .catch(error => {
      S.ui.syncConflict = true;
      render();
      toast(error.message || 'Unable to resolve the synchronization conflict.', { kind: 'err', ms: 12_000 });
      return { status: 'error', error };
    })
    .finally(() => {
      conflictRecoveryPromise = null;
    });
  return conflictRecoveryPromise;
}

window.addEventListener('smena:sync-status', event => {
  const { status, revision, scope } = event.detail;
  if (status === 'recovery_unavailable') {
    if (!S.ui.recoveryUnavailable) toast('Local recovery storage is unavailable. Keep this tab open until changes are saved.', { kind: 'err', ms: 12000 });
    S.ui.recoveryUnavailable = true;
    return;
  }
  if (status === 'syncing') {
    updateSyncIndicator('syncing');
  } else if (status === 'saved') {
    const { data, sentData } = event.detail;
    if (data && sentData) {
      const local = scope && scope !== 'workspace' ? workspaceDocumentData(scope, S.data) : workspaceCoreData(S.data);
      const merged = mergeWorkspaceData(sentData, local, data);
      if (!merged.conflicts.length) Object.assign(S.data, merged.data);
    }
    const wasOffline = S.ui.offline;
    const errors = Object.values(workspaceSyncState().errors);
    S.ui.offline = errors.includes('offline');
    S.ui.syncUnavailable = errors.includes('unavailable');
    S.ui.syncTooLarge = errors.includes('too_large');
    S.ui.syncInvalid = errors.includes('invalid');
    S.ui.syncConflict = errors.includes('conflict');
    if (scope && scope !== 'workspace') S.ui.documentRevisions[scope] = revision;
    else S.ui.workspaceRevision = revision;
    S.ui.lastSyncedAt = Date.now();
    announceWorkspaceChange();
    queueMicrotask(() => {
      const syncState = workspaceSyncState();
      const error = Object.values(syncState.errors)[0];
      if (error) return updateSyncIndicator(error);
      if (syncState.hasActive || syncState.hasPending) return updateSyncIndicator('syncing');
      updateSyncIndicator('saved');
      if (workspaceSyncIsClean(S.data)) setWorkspaceBaseline(S.data);
    });
    if (wasOffline && !S.ui.offline && !errors.length) {
      render();
      toast('Reconnected. All changes are synced.');
    }
  } else if (status === 'offline') {
    updateSyncIndicator('offline');
    S.ui.syncUnavailable = false;
    if (!S.ui.offline) {
      S.ui.offline = true;
      render();
    }
  } else if (status === 'unavailable') {
    updateSyncIndicator('unavailable');
    S.ui.offline = false;
    if (!S.ui.syncUnavailable) {
      S.ui.syncUnavailable = true;
      render();
      toast('The sync service is temporarily unavailable. Your changes are queued for retry.', { kind: 'err', ms: 12_000 });
    }
  } else if (status === 'conflict') {
    updateSyncIndicator('conflict');
    S.ui.offline = false;
    S.ui.syncUnavailable = false;
    S.ui.syncConflict = true;
    render();
    toast('The workspace changed in another session. Trying to merge changes safely…', { kind: 'info', ms: 6000 });
    void handleWorkspaceConflict();
  } else if (status === 'unauthorized') {
    S.ui.currentUser = null;
    S.ui.auth = 'login';
    S.ui.errors = { login: 'Your session has expired. Sign in again.' };
    render();
  } else if (status === 'forbidden') {
    toast('You do not have permission to save workspace changes.', { kind: 'err' });
  } else if (status === 'too_large') {
    updateSyncIndicator('too_large');
    S.ui.offline = false;
    S.ui.syncTooLarge = true;
    render();
    toast('The workspace is too large to sync. Reduce large knowledge notes and try again.', { kind: 'err', ms: 12_000 });
  } else if (status === 'invalid') {
    updateSyncIndicator('invalid');
    S.ui.offline = false;
    S.ui.syncInvalid = true;
    render();
    toast('Changes could not be synced because the workspace data is invalid. Reload the latest saved version.', { kind: 'err', ms: 12_000 });
  }
});

window.addEventListener('smena:personal-save-status', event => {
  const { status, owner } = event.detail;
  if (owner !== S.ui.currentUser?.id) return;
  if (status === 'recovery_unavailable') {
    S.ui.recoveryUnavailable = true;
    if (!S.ui.personalRecoveryUnavailable)
      toast('Local recovery storage is unavailable. Keep this tab open until changes are saved.', { kind: 'err', ms: 12000 });
    S.ui.personalRecoveryUnavailable = true;
    return;
  }
  const changed = status !== S.ui.personalSyncState;
  S.ui.personalSyncState = status;
  if (status === 'saved') S.ui.personalSaveNotified = false;
  if (changed && ['offline', 'unavailable'].includes(status) && !S.ui.personalSaveNotified) {
    S.ui.personalSaveNotified = true;
    toast('Personal settings could not be synced. They will retry automatically.', { kind: 'err', ms: 8000 });
  }
  if (changed && !S.ui.auth) render();
});

window.addEventListener('smena:permission-denied', event => {
  const viewer = event.detail?.role === 'viewer';
  render();
  toast(viewer ? 'You have view-only access to this workspace.' : 'Only an administrator can change this setting.', { kind: 'err' });
});

window.addEventListener('smena:google-credential', event => {
  void A.doGoogleLogin(event.detail?.credential);
});

window.addEventListener('storage', event => {
  if (event.key !== SESSION_STORAGE_KEY) return;
  if (!event.newValue) {
    clearSession();
    disableWorkspaceSync();
    S.ui.currentUser = null;
    S.ui.authSessions = null;
    S.ui.pop = null;
    S.ui.palette = null;
    S.ui.drawer = null;
    S.ui.modals = [];
    S.ui.auth = 'login';
    S.ui.errors = { login: 'You signed out in another tab.' };
    render();
  } else if (!S.ui.currentUser && S.ui.auth === 'login') {
    location.reload();
  }
});

window.addEventListener('smena:session-account-changed', () => {
  disableWorkspaceSync();
  S.ui.currentUser = null;
  S.ui.authSessions = S.ui.pop = S.ui.palette = S.ui.drawer = null;
  S.ui.modals = [];
  S.ui.auth = 'login';
  S.ui.errors = { login: 'The account changed in another tab. Reload this page to continue.' };
  render();
});

function applyBrowserLocation() {
  if (!S.ui.currentUser) return;
  const target = resolveAppLocation(location.pathname, location.hash, D(), S.prefs.home || 'home');
  S.ui.route = target.route;
  S.ui.params = target.params;
  S.ui.drawer = target.drawer || null;
  S.ui.modals = [];
  if (target.file) {
    const file = D().files.find(item => item.id === target.file);
    if (file) S.ui.modals.push({ type: 'filePreview', file, tid: file.task });
  }
  S.ui.locationReady = true;
}

function loadRouteData() {
  if (S.ui.route === 'settings' && S.ui.params.sec === 'security') void A.loadAuthSessions();
  if (S.ui.route === 'settings' && S.ui.params.sec === 'data-transfer') void A.loadWorkspaceBackups();
}

window.addEventListener('popstate', () => {
  S.ui.mnav = false;
  const target = parseAppLocation(location.pathname);
  if (S.ui.currentUser && target.kind === 'file' && target.key && !D().files.some(file => file.id === target.key)) {
    const path = (S.ui.restoringFilePath = location.pathname);
    void import('./features/file-location.js')
      .then(module => module.restoreFileHistory(target.key, path, applyBrowserLocation, loadRouteData))
      .catch(() => {
        if (S.ui.restoringFilePath !== path) return;
        S.ui.restoringFilePath = null;
        S.ui.loading = false;
        applyBrowserLocation();
        render();
      });
    return;
  }
  S.ui.restoringFilePath = null;
  applyBrowserLocation();
  render();
  loadRouteData();
});

(async function init() {
  if (!document.getElementById('sr-live')) {
    const l = document.createElement('div');
    l.id = 'sr-live';
    l.className = 'sr';
    // pageTitle already localizes UI labels and preserves authored entity names.
    l.setAttribute('translate', 'no');
    l.setAttribute('aria-live', 'polite');
    document.body.appendChild(l);
  }
  const h = (location.hash || '').slice(1);
  if (h && ROUTE_NAMES[h]) S.ui.route = h;
  else S.ui.route = S.prefs.home || 'home';
  // Restore the secure cookie before offering a new sign-in.
  S.ui.auth = 'restoring';
  S.ui.authBusy = true;
  render();
  let user = null;
  try {
    user = await restoreSessionAndWorkspace();
    S.ui.authBusy = false;
    S.ui.auth = user ? (S.ui.needsOnboarding ? 'onboarding' : null) : 'login';
    if (S.ui.needsOnboarding) S.ui.onb = 1;
    if (user && !S.ui.needsOnboarding) applyBrowserLocation();
  } catch (error) {
    S.ui.authBusy = false;
    await (await import('./pages/workspace-recovery.js')).applyRecovery(error);
  }
  const restoreView = user && !S.ui.needsOnboarding ? restoreDeploymentContext() : null;
  render();
  restoreView?.();
  if (user && !S.ui.needsOnboarding) {
    loadRouteData();
    void refreshWebPushSubscription();
  }
})();

let workspaceRefreshPromise = null;
let workspaceRefreshTimer = null;
let workspaceRefreshFailures = 0;
async function refreshVisibleWorkspace(showNotice = false) {
  if (S.ui.auth || !S.ui.currentUser || workspaceRefreshPromise) return workspaceRefreshPromise;
  const owner = S.ui.currentUser.id;
  const previousIdentity = JSON.stringify(S.ui.currentUser);
  const previousNotifications = new Set(myNotifications().map(notification => notification.id));
  workspaceRefreshPromise = refreshWorkspaceFromServer()
    .then(result => {
      if (S.ui.currentUser?.id !== owner || result.status === 'session_changed') return;
      workspaceRefreshFailures = 0;
      const flags = pollConnectionFlags(workspaceSyncState());
      const connectionChanged = S.ui.offline !== flags.offline || S.ui.syncUnavailable !== flags.syncUnavailable;
      Object.assign(S.ui, flags);
      if (S.ui.currentUser?.id === owner && ['current', 'updated'].includes(result.status))
        refreshChannel?.postMessage({ type: 'workspace-polled', owner, workspace: getActiveWorkspace(), fingerprint: workspaceFingerprint() });
      if (result.status !== 'updated' && (connectionChanged || previousIdentity !== JSON.stringify(S.ui.currentUser))) render();
      if (result.status === 'updated') {
        const freshNotifications = myNotifications().filter(notification => !previousNotifications.has(notification.id));
        render();
        if (freshNotifications.length && (document.hidden || !document.hasFocus())) {
          freshNotifications.slice(0, 3).forEach(notification =>
            deliverBrowserNotification(notification, D(), myNotificationPreferences(), {
              translate: tr,
              onOpen: () => {
                window.focus();
                go('notifications');
              },
            }),
          );
        } else if (freshNotifications.length) {
          toast(freshNotifications.length === 1 ? 'New notification received.' : `${freshNotifications.length} new notifications received.`, {
            kind: 'info',
            ms: 4000,
            action: 'Open',
            onAction: () => go('notifications'),
          });
        } else if (showNotice) toast('Latest team changes loaded.', { kind: 'info', ms: 2600 });
      }
    })
    .catch(error => {
      if (error.staleSession || S.ui.currentUser?.id !== owner) return;
      if (error.status === 401) {
        clearSession();
        S.ui.currentUser = null;
        S.ui.auth = 'login';
        S.ui.errors = { login: error.message || 'Your session has expired. Sign in again.' };
        render();
        return;
      }
      workspaceRefreshFailures += 1;
      if (!S.ui.offline) {
        S.ui.offline = !error.status;
        S.ui.syncUnavailable = !!error.status;
        render();
      }
    })
    .finally(() => {
      workspaceRefreshPromise = null;
    });
}

function scheduleWorkspaceRefresh(delay = null) {
  clearTimeout(workspaceRefreshTimer);
  workspaceRefreshTimer = setTimeout(
    async () => {
      if (await pollCoordinator.shouldPoll(S.ui.auth ? null : S.ui.currentUser?.id, getActiveWorkspace())) await refreshVisibleWorkspace(false);
      scheduleWorkspaceRefresh();
    },
    delay ?? workspaceRefreshDelay({ hidden: document.hidden, offline: !navigator.onLine, failures: workspaceRefreshFailures }),
  );
}

function refreshWorkspaceSoon(showNotice = false) {
  clearTimeout(workspaceRefreshTimer);
  void Promise.resolve(refreshVisibleWorkspace(showNotice)).finally(() => scheduleWorkspaceRefresh());
}

scheduleWorkspaceRefresh();
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshWorkspaceSoon(true);
  else scheduleWorkspaceRefresh();
});
window.addEventListener('focus', () => refreshWorkspaceSoon(true));
window.addEventListener('online', () => {
  void A.retryOnline();
  void retryPersonalPreferences();
  refreshWorkspaceSoon(true);
  void refreshWebPushSubscription();
});
refreshChannel?.addEventListener('message', event => {
  if (event.data?.workspace !== getActiveWorkspace() || event.data?.owner !== S.ui.currentUser?.id) return;
  if (event.data?.type === 'workspace-saved') refreshWorkspaceSoon(false);
  if (event.data?.type === 'workspace-polled' && event.data.owner === S.ui.currentUser?.id && event.data.fingerprint !== workspaceFingerprint())
    refreshWorkspaceSoon(false);
});
navigator.serviceWorker?.addEventListener('message', event => {
  if (event.data?.type === 'smena:push-subscription-change') void refreshWebPushSubscription();
});

// Dev-only handle for debugging and screenshot tooling; stripped from production builds.
if (import.meta.env.DEV) window.__smena = { S, D, A, go, render };
