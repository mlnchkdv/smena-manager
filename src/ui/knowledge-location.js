import { D, S } from '../core/store.js';
import { A } from '../actions/actions.js';
import { go } from '../shell/render.js';
import { folderTrail } from '../shared/knowledge-tools.js';
import { esc } from '../core/utils.js';
import { t } from '../core/i18n.js';
import { toast } from './toast.js';
export function knowledgeLocation(note) {
  const path = folderTrail(note.folderId, D().knowledgeFolders);
  return `<nav class="knowledge-reader-location" aria-label="${t('Folder')}"><button data-a="openKnowledgeFolderLocation" data-folder="all">${t('Knowledge base')}</button>${(path.length ? path : [{ id: 'root', name: t('No folder') }]).map(folder => `<span aria-hidden="true">/</span><button data-a="openKnowledgeFolderLocation" data-folder="${esc(folder.id)}" translate="no" title="${esc(folder.name)}">${esc(folder.name)}</button>`).join('')}</nav>`;
}
A.openKnowledgeFolderLocation = el => {
  if (S.ui.knowledgeDirty) return toast('Save the note before navigating.', { kind: 'info' });
  const folder = el.dataset.folder;
  if (!['all', 'root'].includes(folder) && !D().knowledgeFolders.some(f => f.id === folder)) return;
  A.closeKnowledgeDrawer();
  if (S.ui.route !== 'knowledge') go('knowledge');
  A.setKnowledgeFolder({ dataset: { folder } });
};
