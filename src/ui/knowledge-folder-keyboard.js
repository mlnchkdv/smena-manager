import { D, S } from '../core/store.js';
import { A } from '../actions/actions.js';

const items = nav => [...nav.querySelectorAll('button[data-a="setKnowledgeFolder"]')].filter(el => el.getClientRects().length);
export function refreshFolderKeyboard() {
  const nav = document.querySelector('.knowledge-folders');
  if (!nav) return;
  const rows = items(nav);
  const chosen = rows.find(el => el.dataset.folder === S.ui.knowledgeFolderFocus) || rows.find(el => el.getAttribute('aria-current') === 'page') || rows[0];
  rows.forEach(el => {
    el.tabIndex = el === chosen ? 0 : -1;
  });
}
document.addEventListener('keydown', event => {
  const row = event.target.closest?.('.knowledge-folders button[data-a="setKnowledgeFolder"]');
  if (!row || event.altKey || event.ctrlKey || event.metaKey || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const nav = row.closest('.knowledge-folders');
  const rows = items(nav),
    at = rows.indexOf(row),
    id = row.dataset.folder;
  let target;
  if (event.key === 'Home') target = rows[0];
  if (event.key === 'End') target = rows.at(-1);
  if (event.key === 'ArrowUp') target = rows[Math.max(0, at - 1)];
  if (event.key === 'ArrowDown') target = rows[Math.min(rows.length - 1, at + 1)];
  const toggle = row.closest('.knowledge-folder-line')?.querySelector('.knowledge-folder-toggle');
  if (
    (event.key === 'ArrowRight' && toggle?.getAttribute('aria-expanded') === 'false') ||
    (event.key === 'ArrowLeft' && toggle?.getAttribute('aria-expanded') === 'true')
  ) {
    A.toggleKnowledgeFolder({ dataset: { folder: id } });
    target = document.querySelector(`.knowledge-folders [data-a="setKnowledgeFolder"][data-folder="${CSS.escape(id)}"]`);
  } else if (event.key === 'ArrowRight') {
    const child = D().knowledgeFolders.find(f => f.parentId === id && rows.some(el => el.dataset.folder === f.id));
    target = rows.find(el => el.dataset.folder === child?.id);
  } else if (event.key === 'ArrowLeft') {
    const parent = D().knowledgeFolders.find(f => f.id === id)?.parentId;
    target = rows.find(el => el.dataset.folder === parent);
  }
  event.preventDefault();
  if (target) {
    S.ui.knowledgeFolderFocus = target.dataset.folder;
    refreshFolderKeyboard();
    target.focus();
  }
});
