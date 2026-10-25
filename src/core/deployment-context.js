import { D, S } from './store.js';
const KEY = 'smena:deployment-return';
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
        workspace: D().ws?.id,
        path: location.pathname,
        at: Date.now(),
        view,
        selector,
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
    value.workspace !== D().ws?.id ||
    value.path !== location.pathname ||
    !Number.isFinite(value.at) ||
    Date.now() - value.at > 900000 ||
    value.at > Date.now()
  )
    return;
  for (const key of fields) if (['string', 'boolean'].includes(typeof value.view?.[key]) && String(value.view[key]).length <= 1000) S.ui[key] = value.view[key];
  const restore = () => {
    const target = document.querySelector(value.selector === '.knowledge-main' ? '.knowledge-main' : '#main-content');
    if (!target || document.querySelector('[aria-busy="true"]')) return;
    target.scrollTop = Math.max(0, Number(value.scroll) || 0);
    window.removeEventListener('smena:page-module-ready', restore);
  };
  window.addEventListener('smena:page-module-ready', restore);
  setTimeout(() => window.removeEventListener('smena:page-module-ready', restore), 10000);
  return restore;
}
