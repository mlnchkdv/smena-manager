import { S } from '../core/store.js';
import { render } from '../shell/render.js';
import { A, IN } from '../actions/actions.js';

IN.graphQuery = el => {
  S.ui.graphQuery = el.value;
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
A.clearGraphSelection = () => {
  S.ui.graphSelected = '';
  S.ui.graphSelectionClosed = true;
  render();
};
