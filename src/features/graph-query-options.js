import { S } from '../core/store.js';

export function graphQueryOptions(mode, source = '') {
  const ui = S.ui,
    modal = ui.modals.at(-1);
  const options = { revision: ui.workspaceRevision, documents: ui.documentRevisions };
  if (mode === 'candidates')
    return {
      ...options,
      mode,
      source: modal?.source,
      query: modal?.query || '',
      kind: modal?.kind || '',
      wikiOnly: !!modal?.wikiLabel,
      inline: !!modal?.inline,
    };
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
