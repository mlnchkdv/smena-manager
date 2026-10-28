import { D, S } from '../core/store.js';
import { go, render } from '../shell/render.js';
import { A, IN } from '../actions/actions.js';
import { resolveGraphEntity } from '../shared/relations.js';

export function showGraph(el) {
  S.ui.graphSelectionClosed = false;
  S.ui.graphCenter = el.dataset.key || '';
  S.ui.graphSelected = S.ui.graphCenter;
  const target = resolveGraphEntity(D(), S.ui.graphCenter);
  if (target) S.ui.graphArchive = target.item.archived || target.item.is_archived ? 'yes' : '';
  for (const field of ['graphQuery', 'graphKind', 'graphProject', 'graphConnected']) S.ui[field] = '';
  S.ui.modals = [];
  S.ui.drawer = null;
  go('graph', S.ui.graphCenter ? { center: S.ui.graphCenter } : {});
}
export function searchInGraph() {
  S.ui.graphQuery = S.ui.searchQ || '';
  for (const field of ['graphKind', 'graphProject', 'graphConnected']) S.ui[field] = '';
  go('graph');
}

IN.graphQuery = el => {
  S.ui.graphQuery = el.value;
  render();
};
A.clearGraphQuery = () => {
  S.ui.graphQuery = '';
  render();
  document.getElementById('graph-search')?.focus({ preventScroll: true });
};
IN.graphLocate = el => {
  S.ui.graphSelected = el.value;
  S.ui.graphSelectionClosed = !el.value;
  render();
};
IN.graphFilter = el => {
  if (['graphKind', 'graphProject', 'graphDepth'].includes(el.dataset.field)) S.ui[el.dataset.field] = el.value;
  render();
};
IN.graphCheck = el => {
  if (['graphConnected', 'graphArchive'].includes(el.dataset.field)) S.ui[el.dataset.field] = el.checked ? 'yes' : '';
  render();
};
A.resetGraphFilters = () => {
  for (const field of ['graphQuery', 'graphKind', 'graphProject', 'graphConnected', 'graphArchive']) S.ui[field] = '';
  render();
};
A.selectGraphNode = el => {
  S.ui.graphSelectionClosed = false;
  S.ui.graphSelected = el.dataset.key;
  render();
};
A.graphControl = el => window.dispatchEvent(new CustomEvent('smena:graph-control', { detail: el.dataset.command }));
A.toggleGraphFilters = () => {
  S.ui.graphFiltersOpen = !S.ui.graphFiltersOpen;
  render();
};
A.toggleGraphFocus = () => {
  S.ui.graphFocus = !S.ui.graphFocus;
  render();
};
A.toggleGraphInteraction = () => {
  S.ui.graphInteract = !S.ui.graphInteract;
  render();
};
A.clearGraphSelection = () => {
  S.ui.graphSelected = '';
  S.ui.graphSelectionClosed = true;
  render();
};
