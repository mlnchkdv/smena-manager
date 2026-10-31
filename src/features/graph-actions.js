import { openModal, closeModal } from '../overlays/modals.js';
import { ic } from '../core/icons.js';
import { isRussian } from '../core/i18n.js';
import { D, S, save } from '../core/store.js';
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
A.toggleGraphSimple = () => {
  S.prefs.graphSimple = !S.prefs.graphSimple;
  save();
  render();
};
A.toggleGraphPhysics = () => {
  S.prefs.graphPhysics = !S.prefs.graphPhysics;
  save();
  render();
};

A.graphDisplayOptions = () => {
  const T = (en, ru) => (isRussian() ? ru : en);
  const option = (a, icon, en, ru, on) =>
    `<button class="btn btn-secondary" data-a="${a}" aria-pressed="${!!on}">${ic(icon, 16)}${T(en, ru)}<span class="sp"></span>${ic(on ? 'check' : 'minus', 14)}</button>`;
  openModal({
    type: 'knowledgeTool',
    render: (_m, H) =>
      `${H(T('Graph display and navigation', 'Вид и навигация графа'))}<div class="modal-b knowledge-library-tools" translate="no">${option('toggleGraphSimple', 'circle-dot', 'Simplified graph', 'Упрощённый граф', S.prefs.graphSimple)}${option('toggleGraphPhysics', 'orbit', 'Physics', 'Физика', S.prefs.graphPhysics)}${option('graphDisplayFocus', 'maximize', 'Focus mode', 'Режим фокуса', S.ui.graphFocus)}<p class="hint">${T('Simplified nodes show their labels on selection. Physics moves unpinned nodes; disabling it retains their positions.', 'В упрощённом виде подписи видны при выборе узла. Физика перемещает незакреплённые узлы; отключение сохраняет их положение.')}</p><p class="hint">${T('On touch screens, enable graph interaction to pan and zoom. Switch back to scroll the page.', 'На сенсорном экране включите управление графом для панорамы и масштаба. Вернитесь к прокрутке, чтобы двигать страницу.')}</p></div><div class="modal-f"><button class="btn btn-primary" data-a="closeModal">${T('Done', 'Готово')}</button></div>`,
  });
};
A.graphDisplayFocus = () => {
  closeModal();
  A.toggleGraphFocus();
};
