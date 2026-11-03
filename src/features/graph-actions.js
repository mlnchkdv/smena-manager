import { openModal, closeModal } from '../overlays/modals.js';
import { esc } from '../core/utils.js';
import { graphListContext } from '../shared/graph-list-context.js';
import { ENTITY_LABELS } from '../ui/relations.js';
import { t } from '../core/i18n.js';
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
  document.querySelector('[data-a="toggleGraphFocus"]')?.focus({ preventScroll: true });
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
      `${H(T('Graph display and navigation', 'Вид и навигация графа'))}<div class="modal-b knowledge-library-tools" translate="no">${option('toggleGraphSimple', 'circle-dot', 'Simplified graph', 'Упрощённый граф', S.prefs.graphSimple)}${option('toggleGraphPhysics', 'orbit', 'Physics', 'Физика', S.prefs.graphPhysics)}${option('graphDisplayFocus', 'maximize', 'Focus mode', 'Режим фокуса', S.ui.graphFocus)}<p class="hint">${T('Simplified nodes show labels on selection. With physics on, connected unpinned nodes follow a dragged node. Turn it off to move nodes individually.', 'В упрощённом виде подписи видны при выборе узла. С физикой связанные незакреплённые узлы следуют за перетаскиваемым. Отключите её для перемещения отдельных узлов.')}</p><p class="hint">${T('On touch screens, enable graph interaction to pan and zoom. Switch back to scroll the page.', 'На сенсорном экране включите управление графом для панорамы и масштаба. Вернитесь к прокрутке, чтобы двигать страницу.')}</p></div><div class="modal-f"><button class="btn btn-primary" data-a="closeModal">${T('Done', 'Готово')}</button></div>`,
  });
};
A.graphDisplayFocus = () => {
  closeModal();
  A.toggleGraphFocus();
};

A.toggleGraphInspector = () => {
  S.ui.graphInspectorExpanded = !S.ui.graphInspectorExpanded;
  render();
};

const hitScope = () =>
  JSON.stringify([
    S.ui.currentUser?.id,
    D().ws.id || D().ws.url,
    S.ui.route,
    S.ui.graphCenter,
    S.ui.graphQuery,
    S.ui.graphKind,
    S.ui.graphProject,
    S.ui.graphArchive,
  ]);
export function chooseGraphHit(nodes, onSelect) {
  const scope = hitScope();
  openModal({
    type: 'knowledgeTool',
    graphHits: nodes,
    graphHitScope: scope,
    graphHitSelect: onSelect,
    render: (m, H) =>
      `${H(isRussian() ? 'Выбрать материал' : 'Choose material')}<div class="modal-b graph-hit-choices">${scope === hitScope() ? m.graphHits.map(node => `<button class="btn btn-secondary" data-a="chooseNearbyGraphNode" data-key="${esc(node.key)}"><span translate="no">${esc(node.title)}</span><small translate="no">${esc(graphListContext(node, t(ENTITY_LABELS[node.kind]), t('No folder')) || t(ENTITY_LABELS[node.kind]))}</small></button>`).join('') : `<p>${t('Material unavailable')}</p>`}</div><div class="modal-f"><button class="btn btn-secondary" data-a="closeModal">${t('Cancel')}</button></div>`,
  });
}
A.chooseNearbyGraphNode = el => {
  const m = S.ui.modals.at(-1);
  if (m?.graphHitScope !== hitScope() || !m.graphHits?.some(node => node.key === el.dataset.key)) return;
  const select = m.graphHitSelect;
  closeModal();
  select(el.dataset.key);
};
