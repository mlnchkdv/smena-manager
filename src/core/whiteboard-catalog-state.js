import { D, S } from './store.js';
const scope = () => `${S.ui.currentUser?.id}:${D().ws.id || D().ws.url}`;
const key = () => `smena.whiteboards.ui.v1:${scope()}`;
export function whiteboardCatalogState() {
  if (S.ui.whiteboardsBrowser?.scope !== scope()) {
    let v = {};
    try {
      v = JSON.parse(localStorage.getItem(key()) || '{}') || {};
    } catch {
      /* optional preferences */
    }
    S.ui.whiteboardsBrowser = {
      scope: scope(),
      query: typeof v.query === 'string' ? v.query.slice(0, 500) : '',
      project: typeof v.project === 'string' ? v.project : '',
      sort: v.sort === 'name' ? 'name' : 'updated',
      archive: v.archive === 'archived' ? 'archived' : '',
      view: v.view === 'list' ? 'list' : 'grid',
      limit: Math.min(2000, Math.max(50, Number(v.limit) || 50)),
      scroll: Math.max(0, Number(v.scroll) || 0),
      restoreScroll: true,
    };
  }
  return S.ui.whiteboardsBrowser;
}
export function saveWhiteboardCatalog() {
  try {
    localStorage.setItem(key(), JSON.stringify(whiteboardCatalogState()));
  } catch {
    /* optional preferences */
  }
}
let scrollTimer;
document.addEventListener(
  'scroll',
  e => {
    if (S.ui.route !== 'whiteboards' || !e.target.matches?.('#main-content') || S.ui.whiteboardsBrowser?.restoreScroll) return;
    whiteboardCatalogState().scroll = e.target.scrollTop;
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      if (S.ui.route === 'whiteboards') saveWhiteboardCatalog();
    }, 180);
  },
  true,
);
