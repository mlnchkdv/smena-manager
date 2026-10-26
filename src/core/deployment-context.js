import { D, S } from './store.js';
import { render } from '../shell/render.js';
import { failedOverlayTarget } from '../shared/deployment-recovery.js';
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
        overlay: failedOverlayTarget(S.ui),
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
    if (!applied) {
      applied = true;
      // Let route-local preference initializers run before restoring transient filters.
      for (const key of fields)
        if (['string', 'boolean'].includes(typeof value.view?.[key]) && String(value.view[key]).length <= 1000) S.ui[key] = value.view[key];
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
    observer.disconnect();
    requestAnimationFrame(() => {
      if (!current()) return;
      document.querySelector(value.selector === '.knowledge-main' ? '.knowledge-main' : '#main-content')?.scrollTo(0, Math.max(0, Number(value.scroll) || 0));
      if (typeof value.focus === 'string') document.getElementById(value.focus)?.focus({ preventScroll: true });
    });
  };
  const observer = new MutationObserver(restore);
  observer.observe(document.getElementById('app'), { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), 10000);
  return restore;
}
