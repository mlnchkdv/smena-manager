import { A, IN } from '../actions/actions.js';
import { S, save } from '../core/store.js';
import { esc, uid } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { isRussian } from '../core/i18n.js';
import { currentGraphLayout, activeDiagramView, diagramScope } from '../core/diagram-view-state.js';
import { whiteboardState } from '../core/whiteboard-state.js';
import { diagramPreferences, validDiagramViews, diagramLayoutChanged } from '../shared/diagram-views.js';
import { disclosureAttributes } from './disclosure.js';
import { openModal, closeModal } from '../overlays/modals.js';
import { render, go } from '../shell/render.js';
import { toast } from './toast.js';
const T = (en, ru) => (isRussian() ? ru : en);
const prefs = () => diagramPreferences(S.prefs.diagramViews);
const context = () => ({
  center: S.ui.params.center || '',
  query: S.ui.graphQuery || '',
  kind: S.ui.graphKind || '',
  project: S.ui.graphProject || '',
  connected: S.ui.graphConnected || '',
  archive: S.ui.graphArchive || '',
  depth: Number(S.ui.graphDepth || 1),
});
const persist = (cfg, reload = true) => {
  if (!validDiagramViews(cfg)) return false;
  S.prefs.diagramViews = JSON.stringify(cfg);
  if (reload) S.ui.diagramViewNonce = (S.ui.diagramViewNonce || 0) + 1;
  save();
  return true;
};
function viewStatus(kind, project) {
  const active = activeDiagramView(kind, project);
  if (!active) return '';
  const layout = kind === 'board' ? whiteboardState(project) : currentGraphLayout();
  const dirty =
    diagramLayoutChanged(kind, active.layout, layout) || (kind === 'graph' && Object.keys(context()).some(key => active.context[key] !== context()[key]));
  return `${dirty ? T('Changed', 'Изменено') : T('Saved', 'Сохранено')} · ${active.name}`;
}
export function refreshDiagramViewStatus() {
  for (const el of document.querySelectorAll('[data-diagram-status]')) {
    el.textContent = viewStatus(el.dataset.kind, el.dataset.project);
    el.title = el.textContent;
  }
}
window.addEventListener('smena:diagram-layout-changed', refreshDiagramViewStatus);
document.addEventListener('pointerup', () => requestAnimationFrame(refreshDiagramViewStatus));
export function diagramViewsControl(kind, project = '') {
  const cfg = prefs(),
    items = cfg.items.filter(i => i.kind === kind && i.project === project);
  const active = activeDiagramView(kind, project);
  return `<details class="ui-menu diagram-view-menu" ${disclosureAttributes('diagram:' + kind + ':' + project)} translate="no"><summary class="btn btn-secondary btn-sm" aria-label="${T('Saved layouts', 'Сохранённые раскладки')}" title="${T('Saved layouts', 'Сохранённые раскладки')}">${ic('bookmark', 14)}<span class="hide-m">${T('Layouts', 'Раскладки')}</span>${active ? `<span class="diagram-layout-status" data-diagram-status data-kind="${kind}" data-project="${esc(project)}">${esc(viewStatus(kind, project))}</span>` : ''}</summary><div><p class="hint">${T('Personal layouts · synced in this workspace', 'Личные раскладки · синхронизируются в этом пространстве')}</p>${items.map(i => `<div class="diagram-view-row"><button data-a="loadDiagramView" data-id="${esc(i.id)}" aria-pressed="${active?.id === i.id}"><span>${esc(i.name)}</span></button><button class="ibtn" data-a="removeDiagramView" data-id="${esc(i.id)}" aria-label="${esc(T('Remove layout', 'Убрать раскладку') + ': ' + i.name)}">${ic('x', 13)}</button></div>`).join('')}<button data-a="saveDiagramView" data-kind="${kind}" data-project="${esc(project)}">${ic('bookmark-plus', 14)}${T('Save layout…', 'Сохранить раскладку…')}</button><button data-a="resetDiagramView" data-kind="${kind}" data-project="${esc(project)}">${ic('rotate-ccw', 14)}${T('Reset layout', 'Сбросить раскладку')}</button></div></details>`;
}
function form(m, H) {
  const items = prefs().items.filter(i => i.kind === m.kind && i.project === m.project);
  return `${H(T('Save personal layout', 'Сохранить личную раскладку'))}<div class="modal-b" translate="no"><label class="field"><span>${T('Save as', 'Сохранить как')}</span><select class="select" aria-label="${T('Save as', 'Сохранить как')}" data-in="diagramSaveTarget"><option value="">${T('New layout', 'Новая раскладка')}</option>${items.map(i => `<option value="${esc(i.id)}" ${m.id === i.id ? 'selected' : ''}>${esc(i.name)}</option>`).join('')}</select></label><label class="field"><span>${T('Name', 'Название')}</span><input class="input" data-in="diagramViewName" maxlength="80" value="${esc(m.name)}" autofocus></label><p class="hint">${T('Up to 12 layouts, including 3 graph layouts. Graph layouts retain filters, positions and pinned nodes; board layouts retain camera and outline mode.', 'До 12 раскладок, из них 3 — для графа. У графа сохраняются фильтры, положения и закрепления; у холста — масштаб, положение и режим списка.')}</p>${m.error ? `<p class="err" role="alert">${esc(m.error)}</p>` : ''}</div><div class="modal-f"><button class="btn btn-secondary" data-a="closeModal">${T('Cancel', 'Отмена')}</button><button class="btn btn-primary" data-a="commitDiagramView">${T('Save', 'Сохранить')}</button></div>`;
}
A.saveDiagramView = el => {
  const kind = el.dataset.kind,
    project = kind === 'board' ? el.dataset.project : '';
  if (!['graph', 'board'].includes(kind)) return;
  const state = kind === 'board' ? whiteboardState(project) : null;
  const layout = state ? { x: state.x, y: state.y, zoom: state.zoom, outline: !!state.outline } : currentGraphLayout();
  if (!layout) return toast(T('Wait for the graph to load.', 'Дождитесь загрузки графа.'), { kind: 'info' });
  openModal({
    type: 'knowledgeTool',
    diagram: true,
    scope: diagramScope(),
    kind,
    project,
    layout,
    context: kind === 'graph' ? context() : undefined,
    id: '',
    name: '',
    render: form,
  });
};
const modal = () => {
  const m = S.ui.modals.at(-1);
  return m?.diagram && m.scope === diagramScope() ? m : null;
};
IN.diagramViewName = el => {
  const m = modal();
  if (m) m.name = el.value;
};
IN.diagramSaveTarget = el => {
  const m = modal();
  if (!m) return;
  const item = prefs().items.find(i => i.id === el.value && i.kind === m.kind && i.project === m.project);
  m.id = item?.id || '';
  m.name = item?.name || '';
  render();
};
A.commitDiagramView = () => {
  const m = modal();
  if (!m) return;
  const cfg = prefs(),
    id = m.id || uid('dv'),
    item = { id, name: m.name.trim(), kind: m.kind, project: m.project, layout: m.layout, ...(m.context ? { context: m.context } : {}) };
  cfg.items = [...cfg.items.filter(i => i.id !== id), item];
  cfg.active = cfg.active.filter(a => {
    const i = cfg.items.find(i => i.id === a);
    return i && !(i.kind === m.kind && i.project === m.project);
  });
  cfg.active.push(id);
  if (!persist(cfg)) {
    m.error = T('Enter a name and keep within the layout limit.', 'Укажите название и соблюдайте лимит раскладок.');
    render();
    return;
  }
  closeModal();
  render();
};
A.loadDiagramView = el => {
  const cfg = prefs(),
    item = cfg.items.find(i => i.id === el.dataset.id);
  if (!item) return;
  cfg.active = cfg.active.filter(id => {
    const i = cfg.items.find(i => i.id === id);
    return i && !(i.kind === item.kind && i.project === item.project);
  });
  cfg.active.push(item.id);
  if (item.kind === 'graph') cfg.pins = item.layout.positions.filter(p => p.locked);
  if (!persist(cfg)) return;
  if (item.kind === 'graph') {
    const c = item.context;
    Object.assign(S.ui, {
      graphQuery: c.query,
      graphKind: c.kind,
      graphProject: c.project,
      graphConnected: c.connected,
      graphArchive: c.archive,
      graphDepth: c.depth,
    });
    go('graph', { center: c.center });
  } else {
    Object.assign(whiteboardState(item.project), item.layout, { fit: false });
    render();
  }
};
A.removeDiagramView = el => {
  const cfg = prefs();
  const wasActive = cfg.active.includes(el.dataset.id);
  cfg.items = cfg.items.filter(i => i.id !== el.dataset.id);
  cfg.active = cfg.active.filter(id => id !== el.dataset.id);
  if (persist(cfg, wasActive)) render();
};
A.resetDiagramView = el => {
  const cfg = prefs(),
    kind = el.dataset.kind,
    project = el.dataset.project || '';
  cfg.active = cfg.active.filter(id => {
    const i = cfg.items.find(i => i.id === id);
    return i && !(i.kind === kind && i.project === project);
  });
  if (kind === 'graph') cfg.pins = [];
  if (!persist(cfg)) return;
  if (kind === 'board') Object.assign(whiteboardState(project), { x: 32, y: 32, zoom: 1, outline: false, fit: true });
  render();
};
A.toggleGraphPin = el => {
  const cfg = prefs(),
    id = el.dataset.key,
    p = currentGraphLayout()?.positions.find(p => p.id === id);
  if (!p) return;
  cfg.pins = cfg.pins.some(p => p.id === id) ? cfg.pins.filter(p => p.id !== id) : [...cfg.pins, { ...p, locked: true }];
  if (persist(cfg, false)) render();
};
