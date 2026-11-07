import { readLayoutPreference, localViewResetApplies } from './view-layout-preferences.js';
import { activeDiagramView } from './diagram-view-state.js';
import { D, S } from './store.js';
import { getSessionGeneration } from './api.js';
import { isRussian } from './i18n.js';
import { countLabel } from '../shared/count-label.js';
import { entityAllowed, resolveGraphEntity } from '../shared/relations.js';
import { whiteboardDocument, legacyWhiteboard } from '../shared/whiteboards.js';
export const currentWhiteboard = () =>
  S.ui.route === 'whiteboard'
    ? whiteboardDocument(D(), S.ui.params.id)
    : S.ui.route === 'project' && S.ui.params.tab === 'whiteboard'
      ? legacyWhiteboard(D(), S.ui.params.id)
      : null;
export const wbText = (en, ru) => (isRussian() ? ru : en);
export const wbCount = (count, kind) => countLabel(count, kind, isRussian() ? 'ru-RU' : 'en-US');
export const whiteboardScope = id => JSON.stringify([getSessionGeneration(), S.ui.activeWorkspace, D().ws.id || D().ws.url, id]);
let state;
window.addEventListener('smena:device-view-reset', event => {
  if (state && localViewResetApplies(event, 'other')) Object.assign(state, { minimap: false, resizeAspect: false, resizeGuides: true, collapsedGroups: {} });
});
export function whiteboardState(id = S.ui.params.id) {
  const scope = whiteboardScope(id);
  if (state?.scope !== scope) {
    state = {
      scope,
      id,
      x: 32,
      y: 32,
      zoom: 1,
      fit: true,
      autoFit: true,
      selected: '',
      selectedEdge: '',
      contextDrafts: {},
      selection: [],
      multiSelect: false,
      outline: false,
      minimap: readLayoutPreference('whiteboard-minimap', false),
      resizeAspect: readLayoutPreference('whiteboard-resize-aspect', false),
      resizeGuides: readLayoutPreference('whiteboard-resize-guides', true),
      collapsedGroups: Object.fromEntries(
        Object.entries(readLayoutPreference('whiteboard-outline:' + id, {}) || {})
          .filter(([key, value]) => typeof key === 'string' && value === true)
          .slice(0, 200),
      ),
      navigationMode: matchMedia('(max-width: 640px), (pointer: coarse)').matches ? 'scroll' : 'move',
      undo: [],
      redo: [],
    };
    const view = activeDiagramView('board', id);
    if (view) Object.assign(state, view.layout, { fit: false, autoFit: false });
  }
  return state;
}
export function whiteboardMaterial(node) {
  const entity = resolveGraphEntity(D(), node.target);
  return entity && entityAllowed(D(), node.target, { role: S.ui.currentUser?.role, memberId: D().me }) ? entity : null;
}
export function whiteboardLabel(node = {}) {
  if (node.type !== 'material')
    return (
      node.title || wbText(node.type === 'group' ? 'Untitled frame' : 'Untitled card', node.type === 'group' ? 'Рамка без названия' : 'Карточка без названия')
    );
  const item = whiteboardMaterial(node)?.item;
  return item?.title || item?.name || item?.url || wbText('Material unavailable', 'Материал недоступен');
}
