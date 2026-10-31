import { whiteboardState } from './whiteboard-state.js';
import { D, S } from './store.js';
import { render } from '../shell/render.js';
import { failedOverlayTarget, readOnlyDeploymentTarget } from '../shared/deployment-recovery.js';
const KEY = 'smena:deployment-return';
const workspace = () => JSON.stringify([D().ws?.id, D().ws?.url]);
let lastFocus = '';
document.addEventListener('focusin', event => {
  if (event.target?.id && !event.target.closest('.deployment-update')) lastFocus = event.target.id;
});
const fields = [
  'fileProject',
  'fileFolder',
  'fileQ',
  'fileType',
  'fileSort',
  'fileView',
  'fileRecursive',
  'knowledgeFolder',
  'knowledgeQuery',
  'knowledgeSort',
  'knowledgeTag',
  'knowledgeShowFolders',
  'knowledgeFolderLayout',
  'knowledgeNoteLayout',
  'graphQuery',
  'graphKind',
  'graphProject',
  'graphConnected',
  'graphArchive',
  'graphDepth',
  'searchQ',
  'searchCat',
];
export function saveDeploymentContext() {
  if (!S.ui.currentUser) return;
  const selector = document.querySelector('.knowledge-main') ? '.knowledge-main' : '#main-content';
  const view = Object.fromEntries(fields.filter(key => ['string', 'boolean'].includes(typeof S.ui[key])).map(key => [key, S.ui[key]]));
  try {
    sessionStorage.setItem(
      KEY,
      JSON.stringify({
        owner: S.ui.currentUser.id,
        workspace: workspace(),
        path: location.pathname,
        at: Date.now(),
        view,
        overlay: failedOverlayTarget(S.ui) || readOnlyDeploymentTarget(S.ui),
        overlayScroll: document.querySelector('.knowledge-drawer-body')?.scrollTop || 0,
        boardView:
          S.ui.route === 'whiteboard'
            ? (() => {
                const s = whiteboardState();
                return { id: S.ui.params.id, x: s.x, y: s.y, zoom: s.zoom, outline: !!s.outline };
              })()
            : null,
        selector,
        focus: lastFocus.slice(0, 128),
        scroll: document.querySelector(selector)?.scrollTop || 0,
      }),
    );
  } catch {
    /* Updating still works when session storage is unavailable. */
  }
}
export function restoreDeploymentContext() {
  let value;
  try {
    value = JSON.parse(sessionStorage.getItem(KEY));
    sessionStorage.removeItem(KEY);
  } catch {
    return;
  }
  if (
    !value ||
    value.owner !== S.ui.currentUser?.id ||
    value.workspace !== workspace() ||
    value.path !== location.pathname ||
    !Number.isFinite(value.at) ||
    Date.now() - value.at > 900000 ||
    value.at > Date.now()
  )
    return;
  let applied = false;
  const current = () => value.owner === S.ui.currentUser?.id && value.workspace === workspace() && value.path === location.pathname;
  const restore = () => {
    if (!current()) return observer.disconnect();
    const target = document.querySelector(value.selector === '.knowledge-main' ? '.knowledge-main' : '#main-content');
    if (!target || document.querySelector('[aria-busy="true"]')) return;
    if (value.boardView && !document.querySelector('.project-whiteboard')) return;
    if (!applied) {
      applied = true;
      // Let route-local preference initializers run before restoring transient filters.
      for (const key of fields)
        if (['string', 'boolean'].includes(typeof value.view?.[key]) && String(value.view[key]).length <= 1000) S.ui[key] = value.view[key];
      const b = value.boardView;
      if (
        b &&
        S.ui.route === 'whiteboard' &&
        b.id === S.ui.params.id &&
        [b.x, b.y, b.zoom].every(Number.isFinite) &&
        Math.abs(b.x) <= 10000000 &&
        Math.abs(b.y) <= 10000000 &&
        b.zoom >= 0.2 &&
        b.zoom <= 2.5
      )
        Object.assign(whiteboardState(), { x: b.x, y: b.y, zoom: b.zoom, outline: !!b.outline, fit: false });
      const overlay = value.overlay;
      if (overlay?.kind === 'note' && D().knowledgeNotes.some(note => note.id === overlay.id)) {
        S.ui.knowledgeDrawer = overlay.id;
        S.ui.knowledgeDrawerView = 'preview';
      } else if (overlay?.kind === 'task' && D().tasks.some(task => task.id === overlay.id)) S.ui.drawer = overlay.id;
      else if (overlay?.kind === 'search' && typeof overlay.query === 'string') S.ui.palette = { q: overlay.query.slice(0, 500) };
      render();
      return;
    }
    if (document.querySelector('.files-page .panel[role="status"]')) return;
    if (value.overlay?.kind === 'note' && !document.querySelector('.knowledge-drawer-body')) return;
    observer.disconnect();
    requestAnimationFrame(() => {
      if (!current()) return;
      document.querySelector(value.selector === '.knowledge-main' ? '.knowledge-main' : '#main-content')?.scrollTo(0, Math.max(0, Number(value.scroll) || 0));
      document.querySelector('.knowledge-drawer-body')?.scrollTo(0, Math.max(0, Number(value.overlayScroll) || 0));
      if (typeof value.focus === 'string') document.getElementById(value.focus)?.focus({ preventScroll: true });
    });
  };
  const observer = new MutationObserver(restore);
  observer.observe(document.getElementById('app'), { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), 10000);
  return restore;
}
