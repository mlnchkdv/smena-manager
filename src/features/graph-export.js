import { D, S } from '../core/store.js';
import { getSessionGeneration, queryWorkspaceGraph } from '../core/api.js';
import { fileCatalogInfo } from '../core/file-catalog-transport.js';
import { graphReadKey } from '../core/graph-query-state.js';
import { graphQueryOptions } from './graph-query-options.js';
import { workspaceGraph } from '../shared/relations.js';
import { graphView } from '../shared/graph-view.js';
import { graphOptions } from '../ui/relations.js';
import { catalogLoadError } from '../shared/catalog-errors.js';
import { toast } from '../ui/toast.js';
import { queueWorkspaceSync, workspaceSyncIsClean } from '../core/workspace-sync.js';

let busy = false;
export async function exportGraph() {
  if (busy) return;
  busy = true;
  const session = getSessionGeneration();
  try {
    await queueWorkspaceSync(S.data);
    if (session !== getSessionGeneration()) return;
    if (!workspaceSyncIsClean(S.data)) throw new Error('Save changes before loading another file page.');
    const key = graphReadKey('export'),
      options = graphQueryOptions('export');
    const graph =
      fileCatalogInfo()?.mode === 'demand'
        ? await queryWorkspaceGraph(options)
        : graphView(workspaceGraph(D(), { ...graphOptions(), includeArchived: options.includeArchived }), { ...options, limit: Infinity });
    if (key !== graphReadKey('export')) return;
    const payload = {
      format: 'smena-graph',
      version: 1,
      exportedAt: new Date().toISOString(),
      total: graph.total,
      nodes: graph.nodes.map(({ key, kind, id, title }) => ({ key, kind, id, title })),
      edges: graph.edges,
    };
    const href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = 'smena-graph.json';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  } catch (error) {
    if (!error.staleSession && session === getSessionGeneration()) toast(catalogLoadError(error));
  } finally {
    busy = false;
  }
}
