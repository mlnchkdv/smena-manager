import { D, S } from '../core/store.js';
import { A } from '../actions/actions.js';
import { go } from '../shell/render.js';
import { folderTrail } from '../shared/knowledge-tools.js';
import { esc } from '../core/utils.js';
import { t } from '../core/i18n.js';
import { toast } from './toast.js';
import { openModal, closeModal } from '../overlays/modals.js';

export function compactKnowledgePath(path, reader = false) {
  const root = `<button data-a="${reader ? 'openKnowledgeFolderLocation' : 'setKnowledgeFolder'}" data-folder="all">${t('Knowledge base')}</button>`;
  const ancestors =
    path.length > 1
      ? `<button class="knowledge-path-more" data-a="openKnowledgePath" data-reader="${reader ? '1' : ''}" data-folder="${esc(path.at(-1).id)}" aria-label="${t('Folder path')}">…</button>`
      : '';
  const current = path.at(-1);
  return `${root}${ancestors ? `<span aria-hidden="true">/</span>${ancestors}` : ''}${current ? `<span aria-hidden="true">/</span><span class="knowledge-path-current" translate="no" title="${esc(current.name)}">${esc(current.name)}</span>` : ''}`;
}
A.openKnowledgePath = el => {
  const path = folderTrail(el.dataset.folder, D().knowledgeFolders);
  openModal({
    type: 'knowledgeTool',
    render: (_m, H) =>
      `${H(t('Folder path'))}<div class="modal-b knowledge-path-list">${[{ id: 'all', name: t('Knowledge base') }, ...path].map(folder => `<button class="btn btn-ghost" data-a="chooseKnowledgePath" data-reader="${el.dataset.reader || ''}" data-folder="${esc(folder.id)}" translate="no">${esc(folder.name)}</button>`).join('')}</div>`,
  });
};
A.chooseKnowledgePath = el => {
  if (S.ui.knowledgeDirty) return toast('Save the note before navigating.', { kind: 'info' });
  closeModal();
  if (el.dataset.reader) A.openKnowledgeFolderLocation(el);
  else A.setKnowledgeFolder(el);
};
export function knowledgeLocation(note) {
  const path = folderTrail(note.folderId, D().knowledgeFolders);
  return `<nav class="knowledge-reader-location" aria-label="${t('Folder')}">${compactKnowledgePath(path.length ? path : [{ id: 'root', name: t('No folder') }], true)}</nav>`;
}
A.openKnowledgeFolderLocation = el => {
  if (S.ui.knowledgeDirty) return toast('Save the note before navigating.', { kind: 'info' });
  const folder = el.dataset.folder;
  if (!['all', 'root'].includes(folder) && !D().knowledgeFolders.some(f => f.id === folder)) return;
  A.closeKnowledgeDrawer();
  if (S.ui.route !== 'knowledge') go('knowledge');
  A.setKnowledgeFolder({ dataset: { folder } });
};
