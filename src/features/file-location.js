import { S } from '../core/store.js';
import { getSessionGeneration } from '../core/api.js';
import { ensureFileIdentities } from './file-catalog-demand.js';
import { render } from '../shell/render.js';
import { toast } from '../ui/toast.js';

// Back/Forward can target a file evicted by another filtered catalog page.
// Keep that address stable while resolving it, but never reopen it after the
// user has navigated elsewhere or changed accounts.
export async function restoreFileHistory(id, path, applyLocation, loadRouteData) {
  const session = getSessionGeneration();
  const current = () => path && path === location.pathname && S.ui.restoringFilePath === path && session === getSessionGeneration();
  if (!current()) return;
  S.ui.modals = [];
  S.ui.loading = true;
  render();
  try {
    await ensureFileIdentities([id]);
  } catch (error) {
    if (current() && !error.staleSession) toast('Unable to load files.', { kind: 'err' });
  } finally {
    if (current()) {
      S.ui.restoringFilePath = null;
      S.ui.loading = false;
      applyLocation();
      render();
      loadRouteData();
    }
  }
}
