import { S } from '../core/store.js';
import { fileCatalogInfo } from '../core/file-catalog-transport.js';
import { getSessionGeneration, queryFileCatalog } from '../core/api.js';
import { refreshGraphContext } from './graph-context.js';
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
// Graphs and pickers use bounded read models, never a writable catalog snapshot.
export async function refreshCatalogContext() {
  if (fileCatalogInfo()?.mode !== 'demand' || !S.ui.currentUser) return;
  void refreshGraphContext();
  if (!workspaceSyncIsClean(S.data)) return;
  const session = getSessionGeneration();
  const query = S.ui.palette?.q || (S.ui.route === 'search' ? S.ui.searchQ : '');
  const ids = new Set();
  for (const modal of S.ui.modals) if (modal.file?.id) ids.add(modal.file.id);
  const panels = [...document.querySelectorAll('[data-catalog-key]')].map(el => el.dataset.catalogKey);
  for (const key of panels) if (key.startsWith('file:')) ids.add(key.slice(5));
  for (const edge of S.data.relations || [])
    if (panels.includes(edge.from) || panels.includes(edge.to)) for (const key of [edge.from, edge.to]) if (key.startsWith('file:')) ids.add(key.slice(5));
  const key = JSON.stringify([session, S.ui.workspaceRevision, query, [...ids].sort()]);
  paintFeedback(key);
  const cached = completedIds.every(id => S.data.files.some(file => file.id === id));
  if ((key === completed && cached) || (!String(query).trim() && [...ids].every(id => S.data.files.some(file => file.id === id)))) return;
  if (!requests.begin(key)) return;
  feedback = { key };
  paintFeedback(key);
  let failure = false;
  try {
    if (String(query).trim()) {
      const result = await queryFileCatalog({ revision: S.ui.workspaceRevision, query: String(query).slice(0, 500), limit: 100 });
      result.files.forEach(file => ids.add(file.id));
    }
    await ensureFileIdentities([...ids]);
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
