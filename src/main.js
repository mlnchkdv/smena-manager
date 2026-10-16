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
import { S, D, setWorkspaceBaseline } from './core/store.js';
import { A } from './actions/actions.js';
import { ROUTE_NAMES, render, go } from './shell/render.js';
import { recoverWorkspaceConflict, refreshWorkspaceFromServer, restoreSessionAndWorkspace } from './core/bootstrap.js';
import { toast } from './ui/toast.js';
import { resolveAppLocation } from './shared/app-location.js';

window.addEventListener('smena:page-module-ready', event => {
  if (event.detail?.route === S.ui.route) render();
});

let conflictRecoveryPromise = null;

function updateSyncIndicator(status) {
  S.ui.syncState = status;
  const indicator = document.getElementById('sync-indicator');
  if (!indicator) return;
  const labels = {
    syncing: 'Сохранение…',
    saved: 'Сохранено',
    offline: 'Нет сети',
    unavailable: 'Сервис недоступен',
    conflict: 'Конфликт',
    too_large: 'Превышен лимит',
    invalid: 'Ошибка данных',
  };
  indicator.dataset.state = status;
  const label = indicator.querySelector('.sync-label');
  if (label) label.textContent = labels[status] || labels.saved;
  if (status === 'saved') indicator.title = `Последняя синхронизация: ${new Date(S.ui.lastSyncedAt || Date.now()).toLocaleTimeString('ru-RU')}`;
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
  const { status, revision, data } = event.detail;
  if (status === 'syncing') {
    updateSyncIndicator('syncing');
  } else if (status === 'saved') {
    const wasOffline = S.ui.offline;
    S.ui.offline = false;
    S.ui.syncUnavailable = false;
    S.ui.syncTooLarge = false;
    S.ui.syncInvalid = false;
    S.ui.syncConflict = false;
    S.ui.workspaceRevision = revision;
    S.ui.lastSyncedAt = Date.now();
    updateSyncIndicator('saved');
    if (data) setWorkspaceBaseline(data);
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
  try {
    const user = await restoreSessionAndWorkspace();
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
})();

let workspaceRefreshPromise = null;
async function refreshVisibleWorkspace(showNotice = false) {
  if (document.hidden || S.ui.auth || !S.ui.currentUser || workspaceRefreshPromise) return;
  workspaceRefreshPromise = refreshWorkspaceFromServer()
    .then(result => {
      if (result.status === 'updated') {
        render();
        if (showNotice) toast('Загружены свежие изменения команды.', { kind: 'info', ms: 2600 });
      }
    })
    .catch(error => {
      if (error.status === 401) return;
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

setInterval(() => void refreshVisibleWorkspace(false), 15_000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) void refreshVisibleWorkspace(true);
});
window.addEventListener('focus', () => void refreshVisibleWorkspace(true));
window.addEventListener('online', () => {
  void A.retryOnline();
  void refreshVisibleWorkspace(true);
});

// Dev-only handle for debugging and screenshot tooling; stripped from production builds.
if (import.meta.env.DEV) window.__smena = { S, D, A, go, render };
