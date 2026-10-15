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
import './pages/settings.js';
import './pages/auth.js';
import './pages/design-system.js';
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
import { S, D } from './core/store.js';
import { A } from './actions/actions.js';
import { ROUTE_NAMES, render, go } from './shell/render.js';
import { restoreSessionAndWorkspace } from './core/bootstrap.js';
import { toast } from './ui/toast.js';

window.addEventListener('smena:sync-status', event => {
  const { status, revision } = event.detail;
  if (status === 'saved') {
    const wasOffline = S.ui.offline;
    S.ui.offline = false;
    S.ui.syncUnavailable = false;
    S.ui.syncTooLarge = false;
    S.ui.syncInvalid = false;
    S.ui.workspaceRevision = revision;
    if (wasOffline) {
      render();
      toast('Reconnected. All changes are synced.');
    }
  } else if (status === 'offline') {
    S.ui.syncUnavailable = false;
    if (!S.ui.offline) {
      S.ui.offline = true;
      render();
    }
  } else if (status === 'unavailable') {
    S.ui.offline = false;
    if (!S.ui.syncUnavailable) {
      S.ui.syncUnavailable = true;
      render();
      toast('The sync service is temporarily unavailable. Your changes are queued for retry.', { kind: 'err', ms: 12_000 });
    }
  } else if (status === 'conflict') {
    S.ui.offline = false;
    S.ui.syncUnavailable = false;
    S.ui.syncConflict = true;
    toast('The workspace changed elsewhere. Reload to use the latest version.', {
      kind: 'err',
      ms: 12_000,
      action: 'Reload',
      onAction: () => location.reload(),
    });
  } else if (status === 'unauthorized') {
    S.ui.currentUser = null;
    S.ui.auth = 'login';
    S.ui.errors = { login: 'Your session has expired. Sign in again.' };
    render();
  } else if (status === 'forbidden') {
    toast('You do not have permission to save workspace changes.', { kind: 'err' });
  } else if (status === 'too_large') {
    S.ui.offline = false;
    S.ui.syncTooLarge = true;
    render();
    toast('The workspace is too large to sync. Reduce large knowledge notes and try again.', { kind: 'err', ms: 12_000 });
  } else if (status === 'invalid') {
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
    S.ui.auth = user ? null : 'login';
  } catch (error) {
    S.ui.authBusy = false;
    S.ui.auth = 'login';
    S.ui.authIssue = error.status === 401 ? '' : error.message || 'Unable to connect to the workspace server.';
  }
  render();
})();

// Dev-only handle for debugging and screenshot tooling; stripped from production builds.
if (import.meta.env.DEV) window.__smena = { S, D, A, go, render };
