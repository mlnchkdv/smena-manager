import { S } from '../core/store.js';
import { getSessionGeneration, queryWorkspaceGraph } from '../core/api.js';
import { graphReads, graphReadKey } from '../core/graph-query-state.js';
import { graphQueryOptions } from './graph-query-options.js';
import { render } from '../shell/render.js';
import { A } from '../actions/actions.js';
import { catalogLoadError } from '../shared/catalog-errors.js';
import { backgroundRender } from './background-render.js';
import { waitForPersonalPreferences } from '../core/personal-preferences.js';
import { workspaceSyncIsClean } from '../core/workspace-sync.js';
import { refreshWorkspaceFromServer } from '../core/bootstrap.js';
import { readCatalogWithRevisionRefresh } from '../shared/catalog-revision-retry.js';

A.retryGraphQuery = () => {
  graphReads.clear();
  render();
};
const pending = new Set();
window.addEventListener('smena:sync-status', event => {
  if (event.detail.status === 'saved' && (S.ui.route === 'graph' || S.ui.modals.at(-1)?.type === 'relations' || document.querySelector('[data-catalog-key]')))
    queueMicrotask(() => backgroundRender());
});
export async function refreshGraphContext() {
  const scopes = [];
  if (S.ui.route === 'graph') scopes.push(['view', '']);
  if (S.ui.modals.at(-1)?.type === 'relations') scopes.push(['candidates', '']);
  for (const source of new Set([...document.querySelectorAll('[data-catalog-key]')].map(el => el.dataset.catalogKey))) scopes.push(['connections', source]);
  for (const [mode, source] of scopes.slice(0, 4)) {
    const slot = mode + source;
    let key = graphReadKey(mode, source);
    if (graphReads.get(slot)?.key === key || pending.has(slot) || pending.size >= 4) continue;
    pending.add(slot);
    const session = getSessionGeneration();
    const owner = S.data.ws?.id || S.data.ws?.url;
    const queryContext = () => JSON.stringify({ ...graphQueryOptions(mode, source), revision: undefined, documents: undefined });
    const context = queryContext();
    const canRefresh = () =>
      session === getSessionGeneration() && owner === (S.data.ws?.id || S.data.ws?.url) && context === queryContext() && workspaceSyncIsClean(S.data);
    try {
      // Preferences can advance the shared revision too. Finish our own writes
      // before reading, and refresh once on an external revision conflict.
      // Never merge a snapshot over dirty edits or across account/filter scope.
      await waitForPersonalPreferences();
      if (key !== graphReadKey(mode, source)) continue;
      const view = await readCatalogWithRevisionRefresh(
        () => queryWorkspaceGraph(graphQueryOptions(mode, source)),
        async () => {
          await waitForPersonalPreferences();
          if (!canRefresh()) return;
          await refreshWorkspaceFromServer();
          if (canRefresh()) key = graphReadKey(mode, source);
        },
        canRefresh,
      );
      // This is a revision-fenced read model, not a workspace merge. Pending
      // local edits must not indefinitely block the first graph response.
      if (key !== graphReadKey(mode, source)) continue;
      graphReads.set(slot, { key, view });
    } catch (error) {
      if (!error.staleSession && session === getSessionGeneration() && key === graphReadKey(mode, source))
        graphReads.set(slot, { key, error: catalogLoadError(error) });
    } finally {
      pending.delete(slot);
      // Keep only a few bounded views; never retain a whole graph per visited material.
      while (graphReads.size > 6) graphReads.delete(graphReads.keys().next().value);
      backgroundRender();
    }
  }
}
