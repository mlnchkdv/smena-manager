import { D, S } from '../core/store.js';
import { esc } from '../core/utils.js';

let opened = '';
function positionMenu(target) {
  const menu = target.querySelector?.(':scope > div');
  if (!menu || !target.open) return;
  menu.style.translate = 'none';
  const rect = menu.getBoundingClientRect();
  const right = document.documentElement.clientWidth - 8;
  const bottom = innerHeight - (matchMedia('(max-width:640px)').matches ? 76 : 8);
  const x = Math.max(8 - rect.left, Math.min(0, right - rect.right));
  const y = Math.max(8 - rect.top, Math.min(0, bottom - rect.bottom));
  menu.style.translate = `${x}px ${y}px`;
}
export function fileFolderMenu(projectId, folderId) {
  const key = JSON.stringify([S.ui.currentUser?.id, D().ws?.id || D().ws?.url, projectId, folderId]);
  return `data-file-folder-menu="${esc(key)}" ${opened === key ? 'open' : ''}`;
}

export function rememberFileFolderMenu(event) {
  const target = event.target;
  const key = target?.dataset?.fileFolderMenu;
  // Native toggle events can arrive after a full background DOM replacement.
  // An old detached element must not close its newly rendered counterpart.
  if (!key || !target.isConnected) return;
  if (target.open) opened = key;
  else if (opened === key) opened = '';
  positionMenu(target);
}
document.addEventListener('toggle', rememberFileFolderMenu, true);
globalThis.window?.addEventListener('resize', () => document.querySelectorAll('.files-folder-menu[open]').forEach(positionMenu));
