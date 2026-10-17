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
import './pages/home.js';
import './pages/overview.js';
import './pages/my-tasks.js';
import './pages/tasks.js';
import './pages/inbox.js';
import './pages/notifications.js';
import './pages/favorites.js';
import './pages/projects.js';
import './pages/members.js';
import './pages/activity.js';
import './pages/search.js';
import './pages/errors.js';
import './pages/project.js';
import './views/project-overview.js';
import './views/board.js';
import './views/table.js';
import './views/calendar.js';
import './views/timeline.js';
import './views/files.js';
import './overlays/drawer.js';
import './overlays/modals.js';
import './overlays/popovers.js';
import './overlays/context-menu.js';
import './overlays/palette.js';
import './pages/auth.js';
import './actions/actions.js';
import './actions/events.js';
import './actions/keyboard.js';
import './actions/drag-drop.js';
import './features/teams.js';
import './features/subtasks.js';
import './features/archive.js';
import './actions/teams.js';
import './actions/subtasks.js';
import './actions/archive.js';
import { S, D, myNotificationPreferences, myNotifications, setWorkspaceBaseline } from './core/store.js';
import { A } from './actions/actions.js';
import { ROUTE_NAMES, render, go } from './shell/render.js';
import { recoverWorkspaceConflict, refreshWorkspaceFromServer, restoreSessionAndWorkspace } from './core/bootstrap.js';
import { toast } from './ui/toast.js';
import { resolveAppLocation } from './shared/app-location.js';
import { deliverBrowserNotification } from './core/browser-notifications.js';
import { t as tr } from './core/i18n.js';
import { syncWebPushSubscription } from './core/push-subscriptions.js';
import { workspaceSyncIsClean, workspaceSyncState } from './core/workspace-sync.js';
import { workspaceRefreshDelay } from './core/workspace-refresh.js';

window.addEventListener('smena:page-module-ready', event => {
  if (event.detail?.route === S.ui.route) render();
});

let conflictRecoveryPromise = null;
let pushSyncPromise = null;
const refreshChannel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('smena:workspace:v2') : null;
let refreshAnnouncementTimer = null;

function announceWorkspaceChange() {
  if (!refreshChannel) return;
  clearTimeout(refreshAnnouncementTimer);
  refreshAnnouncementTimer = setTimeout(() => {
    refreshChannel.postMessage({ type: 'workspace-saved', at: Date.now() });
  }, 80);
}

async function refreshWebPushSubscription() {
  if (S.ui.auth || !S.ui.currentUser || pushSyncPromise) return pushSyncPromise;
  S.ui.pushState = 'checking';
  pushSyncPromise = syncWebPushSubscription(myNotificationPreferences())
    .then(state => {
      S.ui.pushState = state;
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
  document.querySelectorAll('.account-avatar-status').forEach(avatar => {
    avatar.dataset.state = status;
  });
  document.querySelectorAll('.account-menu-trigger').forEach(trigger => {
    trigger.setAttribute('aria-label', `${tr('Account menu')}. ${tr(labels[status] || labels.saved)}`);
  });
  const label = indicator.querySelector('.sync-label');
  if (label) label.textContent = tr(labels[status] || labels.saved);
  indicator.title =
    status === 'saved'
      ? `${tr('Last synchronized')}: ${new Date(S.ui.lastSyncedAt || Date.now()).toLocaleTimeString(S.prefs.lang === 'Русский' ? 'ru-RU' : S.prefs.lang === 'English (UK)' ? 'en-GB' : 'en-US')}`
      : tr(labels[status] || labels.saved);
}

async function handleWorkspaceConflict() {
  if (conflictRecoveryPromise) return conflictRecoveryPromise;
  conflictRecoveryPromise = recoverWorkspaceConflict()
    .then(result => {
      if (result.status === 'merged') {
        S.ui.syncConflict = false;
        render();
        toast('Изменения из двух сессий безопасно объединены.');
      } else if (result.status === 'manual') {
        S.ui.syncConflict = true;
        render();
        toast('Одни и те же данные изменены в двух сессиях. Ваш вариант сохранён как резервная копия в этом браузере.', {
          kind: 'err',
          ms: 15_000,
          action: 'Загрузить серверную версию',
          onAction: () => void A.reloadWorkspaceVersion(),
        });
      }
      return result;
    })
    .catch(error => {
      S.ui.syncConflict = true;
      render();
      toast(error.message || 'Не удалось разрешить конфликт синхронизации.', { kind: 'err', ms: 12_000 });
      return { status: 'error', error };
    })
    .finally(() => {
      conflictRecoveryPromise = null;
    });
  return conflictRecoveryPromise;
}

window.addEventListener('smena:sync-status', event => {
  const { status, revision, scope } = event.detail;
  if (status === 'syncing') {
    updateSyncIndicator('syncing');
  } else if (status === 'saved') {
    const wasOffline = S.ui.offline;
    S.ui.offline = false;
    S.ui.syncUnavailable = false;
    S.ui.syncTooLarge = false;
    S.ui.syncInvalid = false;
    S.ui.syncConflict = false;
    if (scope && scope !== 'workspace') S.ui.documentRevisions[scope] = revision;
    else S.ui.workspaceRevision = revision;
    S.ui.lastSyncedAt = Date.now();
    announceWorkspaceChange();
    queueMicrotask(() => {
      const syncState = workspaceSyncState();
      if (syncState.hasActive || syncState.hasPending) return updateSyncIndicator('syncing');
      updateSyncIndicator('saved');
      if (workspaceSyncIsClean(S.data)) setWorkspaceBaseline(S.data);
    });
    if (wasOffline) {
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
    toast('Рабочее пространство изменилось в другой сессии. Пытаемся безопасно объединить правки…', { kind: 'info', ms: 6000 });
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

window.addEventListener('smena:permission-denied', event => {
  const viewer = event.detail?.role === 'viewer';
  render();
  toast(viewer ? 'You have view-only access to this workspace.' : 'Only an administrator can change this setting.', { kind: 'err' });
});

window.addEventListener('smena:google-credential', event => {
  void A.doGoogleLogin(event.detail?.credential);
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

window.addEventListener('popstate', () => {
  applyBrowserLocation();
  render();
});

(async function init() {
  if (!document.getElementById('sr-live')) {
    const l = document.createElement('div');
    l.id = 'sr-live';
    l.className = 'sr';
    l.setAttribute('aria-live', 'polite');
    document.body.appendChild(l);
  }
  const h = (location.hash || '').slice(1);
  if (h && ROUTE_NAMES[h]) S.ui.route = h;
  else S.ui.route = S.prefs.home || 'home';
  S.ui.auth = 'login';
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
    S.ui.auth = 'login';
    S.ui.authIssue = error.status === 401 ? '' : error.message || 'Unable to connect to the workspace server.';
  }
  render();
  if (user && !S.ui.needsOnboarding) void refreshWebPushSubscription();
})();

let workspaceRefreshPromise = null;
let workspaceRefreshTimer = null;
let workspaceRefreshFailures = 0;
async function refreshVisibleWorkspace(showNotice = false) {
  if (S.ui.auth || !S.ui.currentUser || workspaceRefreshPromise) return workspaceRefreshPromise;
  const previousNotifications = new Set(myNotifications().map(notification => notification.id));
  workspaceRefreshPromise = refreshWorkspaceFromServer()
    .then(result => {
      workspaceRefreshFailures = 0;
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
          toast(freshNotifications.length === 1 ? 'Получено новое уведомление.' : `Получено новых уведомлений: ${freshNotifications.length}.`, {
            kind: 'info',
            ms: 4000,
            action: 'Открыть',
            onAction: () => go('notifications'),
          });
        } else if (showNotice) toast('Загружены свежие изменения команды.', { kind: 'info', ms: 2600 });
      }
    })
    .catch(error => {
      if (error.status === 401) return;
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
      await refreshVisibleWorkspace(false);
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
  refreshWorkspaceSoon(true);
  void refreshWebPushSubscription();
});
refreshChannel?.addEventListener('message', event => {
  if (event.data?.type === 'workspace-saved') refreshWorkspaceSoon(false);
});
navigator.serviceWorker?.addEventListener('message', event => {
  if (event.data?.type === 'smena:push-subscription-change') void refreshWebPushSubscription();
});

// Dev-only handle for debugging and screenshot tooling; stripped from production builds.
if (import.meta.env.DEV) window.__smena = { S, D, A, go, render };
