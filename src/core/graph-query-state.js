import { S } from './store.js';
import { getSessionGeneration } from './api.js';
import { fileCatalogInfo } from './file-catalog-transport.js';

export const graphReads = new Map();
export function graphQueryOptions(mode, source = '') {
  const ui = S.ui,
    modal = ui.modals.at(-1);
  const options = { revision: ui.workspaceRevision, documents: ui.documentRevisions };
  if (mode === 'candidates')
    return { ...options, mode, source: modal?.source, query: modal?.query || '', kind: modal?.kind || '', wikiOnly: !!modal?.wikiLabel };
  if (mode === 'connections') return { ...options, mode: 'view', center: source, depth: 1, includeArchived: true };
  return {
    ...options,
    mode,
    center: ui.params.center || '',
    depth: Number(ui.graphDepth || 1),
    query: ui.graphQuery || '',
    kind: ui.graphKind || '',
    project: ui.graphProject || '',
    connectedOnly: ui.graphConnected === 'yes',
    includeArchived: ui.graphArchive === 'yes',
  };
}
export const graphReadKey = (mode, source = '') => JSON.stringify([getSessionGeneration(), S.data.ws?.id || S.data.ws?.url, graphQueryOptions(mode, source)]);
export function graphReadModel(mode, source = '') {
  if (fileCatalogInfo()?.mode !== 'demand') return null;
  const entry = graphReads.get(mode + source);
  return entry?.key === graphReadKey(mode, source) ? entry : { loading: true };
}
