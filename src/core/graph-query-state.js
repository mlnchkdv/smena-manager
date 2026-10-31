import { S } from './store.js';
import { getSessionGeneration } from './api.js';
import { fileCatalogInfo } from './file-catalog-transport.js';

export const graphReads = new Map();
export function graphReadKey(mode, source = '') {
  const ui = S.ui,
    modal = ui.modals.at(-1);
  const filters =
    mode === 'candidates'
      ? [modal?.source, modal?.query, modal?.kind, !!modal?.wikiLabel, !!modal?.inline]
      : mode === 'connections'
        ? source
        : [ui.params.center, ui.graphDepth, ui.graphQuery, ui.graphKind, ui.graphProject, ui.graphConnected, ui.graphArchive];
  return JSON.stringify([getSessionGeneration(), S.data.ws?.id || S.data.ws?.url, ui.workspaceRevision, ui.documentRevisions, mode, filters]);
}
export function graphReadModel(mode, source = '') {
  if (fileCatalogInfo()?.mode !== 'demand') return null;
  const entry = graphReads.get(mode + source);
  return entry?.key === graphReadKey(mode, source) ? entry : { loading: true };
}
