import { D, S } from './store.js';
import { getSessionGeneration } from './api.js';
import { isRussian } from './i18n.js';
import { entityAllowed, resolveGraphEntity } from '../shared/relations.js';
export const wbText = (en, ru) => (isRussian() ? ru : en);
export const whiteboardScope = id => JSON.stringify([getSessionGeneration(), S.ui.activeWorkspace, D().ws.id || D().ws.url, id]);
let state;
export function whiteboardState(id = S.ui.params.id) {
  const scope = whiteboardScope(id);
  if (state?.scope !== scope) state = { scope, id, x: 32, y: 32, zoom: 1, fit: true, selected: '', outline: false, undo: [], redo: [] };
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
