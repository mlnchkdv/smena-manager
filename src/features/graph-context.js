import { S } from '../core/store.js';
import { getSessionGeneration, queryWorkspaceGraph } from '../core/api.js';
import { graphReads, graphReadKey, graphQueryOptions } from '../core/graph-query-state.js';
import { render } from '../shell/render.js';
import { A } from '../actions/actions.js';
import { catalogLoadError } from '../shared/catalog-errors.js';

A.retryGraphQuery = () => {
  graphReads.clear();
  render();
};
const pending = new Set();
export async function refreshGraphContext() {
  const scopes = [];
  if (S.ui.route === 'graph') scopes.push(['view', '']);
  if (S.ui.modals.at(-1)?.type === 'relations') scopes.push(['candidates', '']);
  for (const source of new Set([...document.querySelectorAll('[data-catalog-key]')].map(el => el.dataset.catalogKey))) scopes.push(['connections', source]);
  for (const [mode, source] of scopes.slice(0, 4)) {
    const slot = mode + source,
      key = graphReadKey(mode, source);
    if (graphReads.get(slot)?.key === key || pending.has(slot) || pending.size >= 4) continue;
    pending.add(slot);
    const session = getSessionGeneration();
    try {
      const view = await queryWorkspaceGraph(graphQueryOptions(mode, source));
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
      render();
    }
  }
}
