import { S } from './store.js';
import { workspaceSyncIsClean, workspaceSyncState } from './workspace-sync.js';
import { personalPreferenceSyncState } from './personal-preferences.js';
import { deploymentReloadSafe } from '../shared/deployment-recovery.js';
import { t } from './i18n.js';
import { saveDeploymentContext } from './deployment-context.js';

export function installDeploymentRecovery(buildId) {
  let changed = false,
    failed = false,
    checking = false,
    presentation = '',
    deferred = false;
  const root = document.createElement('aside');
  root.className = 'deployment-update';
  root.hidden = true;
  root.setAttribute('aria-label', t('App update'));
  document.body.append(root);
  const safe = () =>
    deploymentReloadSafe({
      clean: !S.ui.currentUser || workspaceSyncIsClean(S.data),
      sync: workspaceSyncState(),
      personal: personalPreferenceSyncState(),
      uploads: S.ui.uploads,
      transfer: S.ui.fileDownload || (['preparing', 'ready'].includes(S.ui.fileNativeTransfer?.phase) && S.ui.fileNativeTransfer),
      forms: S.ui.modals?.length || S.ui.drawer || S.ui.knowledgeDrawer || S.ui.pop || S.ui.palette,
      drafts: Object.values(S.ui.drafts || {}).some(value => Boolean(value)),
      loading: S.ui.loading,
      authBusy: S.ui.authBusy,
    });
  function paint() {
    if (Boolean(S.ui.deploymentChanged) !== changed) {
      S.ui.deploymentChanged = changed;
      window.dispatchEvent(new Event('smena:deployment-version'));
    }
    if ((!changed && !failed) || (deferred && !failed)) {
      root.hidden = true;
      presentation = '';
      return;
    }
    const canReload = safe();
    const next = JSON.stringify([changed, failed, canReload, S.prefs.lang]);
    if (next === presentation) return;
    presentation = next;
    root.hidden = false;
    root.replaceChildren();
    const text = document.createElement('span');
    text.setAttribute('role', 'status');
    text.textContent = t(changed ? 'A new app version is available.' : 'This section could not load. Check for an app update.');
    const hint = document.createElement('small');
    hint.textContent = t(
      canReload ? 'Your saved data and current address will be kept.' : 'Save changes, close open forms and finish transfers before updating.',
    );
    const button = document.createElement('button');
    button.className = 'btn btn-secondary btn-sm';
    button.textContent = t(changed ? 'Update app' : 'Check for update');
    button.disabled = changed && !canReload;
    button.addEventListener('click', () => {
      if (!changed) return void check();
      // Recheck at the actual click, not just when the banner was rendered.
      if (safe()) {
        saveDeploymentContext();
        location.reload();
      } else paint();
    });
    root.append(text, hint, button);
    if (!failed) {
      const later = document.createElement('button');
      later.className = 'btn btn-ghost btn-sm';
      later.textContent = t('Later');
      later.addEventListener('click', () => {
        deferred = true;
        paint();
      });
      root.append(later);
    }
  }
  async function check() {
    if (checking || document.hidden) return;
    checking = true;
    try {
      const response = await fetch('/app-version.json', { cache: 'no-store', credentials: 'omit' });
      if (response.ok && response.headers.get('content-type')?.includes('json')) {
        const value = await response.json();
        changed = typeof value.version === 'string' && value.version !== buildId;
      }
    } catch {
      /* Offline never forces a reload. */
    } finally {
      checking = false;
      paint();
    }
  }
  window.addEventListener('vite:preloadError', () => {
    failed = true;
    void check();
    paint();
  });
  window.addEventListener('smena:page-module-ready', () => {
    if (failed) void check();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void check();
  });
  setInterval(() => {
    void check();
  }, 60000);
  setInterval(() => {
    if (!document.hidden && (changed || failed)) paint();
  }, 2000);
  void check();
}
