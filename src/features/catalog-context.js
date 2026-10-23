import { S } from '../core/store.js';
import { fileCatalogInfo } from '../core/file-catalog-transport.js';
import { getSessionGeneration, loadCompleteFileCatalog, queryFileCatalog } from '../core/api.js';
import { applyExternalCoreSnapshot } from '../core/bootstrap.js';
import { workspaceSyncIsClean } from '../core/workspace-sync.js';
import { ensureFileIdentities } from './file-catalog-demand.js';
import { render } from '../shell/render.js';
import { A } from '../actions/actions.js';
import { createContextLoadGuard } from '../shared/context-load-guard.js';
import { catalogLoadError } from '../shared/catalog-errors.js';
import { t } from '../core/i18n.js';
import '../ui/file-translations.js';

const requests = createContextLoadGuard();
let completed = '',
  completedIds = [],
  feedback = null;
function paintFeedback(key) {
  document.querySelectorAll('.catalog-context-status').forEach(el => el.remove());
  if (feedback?.key !== key) return;
  const anchor = document.querySelector('.palette .pal-in,.relation-picker > .input,.search-page > .inwrap,.graph-toolbar,.relations-panel > .relations-head');
  if (!anchor) return;
  const box = document.createElement('div');
  box.className = 'catalog-context-status';
  box.setAttribute('role', 'status');
  const message = document.createElement('span');
  message.textContent = (feedback.error ? t('Some file results may be missing.') + ' ' : '') + t(feedback.error || 'Loading file connections…');
  box.append(message);
  if (feedback.error) {
    const retry = document.createElement('button');
    retry.className = 'btn btn-secondary btn-sm';
    retry.dataset.a = 'retryCatalogContext';
    retry.textContent = t('Try again');
    box.append(retry);
  }
  anchor.after(box);
}
A.retryCatalogContext = () => {
  requests.retry();
  completed = '';
  feedback = null;
  render();
};
// Full graph construction is an explicit consumer; ordinary file browsing and
// searches never hydrate the entire catalog. Linked panels resolve endpoints.
export async function refreshCatalogContext() {
  if (fileCatalogInfo()?.mode !== 'demand' || !S.ui.currentUser || !workspaceSyncIsClean(S.data)) return;
  const session = getSessionGeneration();
  const query = S.ui.palette?.q || (S.ui.route === 'search' ? S.ui.searchQ : '');
  const full = S.ui.route === 'graph' || S.ui.modals.some(modal => modal.type === 'relations' && !modal.wikiLabel);
  const ids = new Set();
  for (const modal of S.ui.modals) if (modal.file?.id) ids.add(modal.file.id);
  const panels = [...document.querySelectorAll('[data-catalog-key]')].map(el => el.dataset.catalogKey);
  for (const edge of S.data.relations || [])
    if (panels.includes(edge.from) || panels.includes(edge.to)) for (const key of [edge.from, edge.to]) if (key.startsWith('file:')) ids.add(key.slice(5));
  const key = JSON.stringify([session, S.ui.workspaceRevision, full, query, [...ids].sort()]);
  paintFeedback(key);
  const cached = completedIds.every(id => S.data.files.some(file => file.id === id)) && (!full || S.data.files.length === fileCatalogInfo().total);
  if ((key === completed && cached) || (!full && !String(query).trim() && [...ids].every(id => S.data.files.some(file => file.id === id)))) return;
  if (!requests.begin(key)) return;
  feedback = { key };
  paintFeedback(key);
  let failure = false;
  try {
    if (full) {
      const base = structuredClone(S.data);
      const snapshot = await loadCompleteFileCatalog();
      if (session !== getSessionGeneration() || !workspaceSyncIsClean(S.data)) return;
      applyExternalCoreSnapshot(snapshot, base);
    } else {
      if (String(query).trim()) {
        const result = await queryFileCatalog({ revision: S.ui.workspaceRevision, query: String(query).slice(0, 500), limit: 100 });
        result.files.forEach(file => ids.add(file.id));
      }
      await ensureFileIdentities([...ids]);
    }
    completed = key;
    completedIds = S.data.files.map(file => file.id);
    feedback = null;
  } catch (error) {
    failure = !error.staleSession;
    if (failure && session === getSessionGeneration()) feedback = { key, error: catalogLoadError(error) };
  } finally {
    if (feedback?.key === key && !feedback.error) feedback = null;
    requests.end(key, failure);
    render();
  }
}
