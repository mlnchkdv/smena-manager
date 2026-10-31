import { D, S } from './store.js';
import { getSessionGeneration } from './api.js';
import { diagramPreferences } from '../shared/diagram-views.js';
let reader, readerScope, applied;
export const registerGraphLayoutReader = fn => {
  readerScope = diagramScope();
  reader = fn;
};
export const currentGraphLayout = () => (readerScope === diagramScope() ? reader?.() || null : null);
export const diagramScope = () => JSON.stringify([getSessionGeneration(), S.ui.currentUser?.id, D().ws.id || D().ws.url]);
export const activeDiagramView = (kind, project = '') => {
  const cfg = diagramPreferences(S.prefs.diagramViews);
  return cfg.items.find(i => i.kind === kind && i.project === project && cfg.active.includes(i.id));
};
export function preparePersonalGraph(center) {
  const item = activeDiagramView('graph');
  if (!item || item.context.center !== center) return;
  const key = diagramScope() + ':' + item.id + ':' + center + ':' + (S.ui.diagramViewNonce || 0);
  if (applied === key) return;
  applied = key;
  const c = item.context;
  Object.assign(S.ui, {
    graphQuery: c.query,
    graphKind: c.kind,
    graphProject: c.project,
    graphConnected: c.connected,
    graphArchive: c.archive,
    graphDepth: c.depth,
  });
}
