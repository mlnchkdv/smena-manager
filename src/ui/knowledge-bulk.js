import { D, S } from '../core/store.js';
import { esc } from '../core/utils.js';
import { folderTrail } from '../shared/knowledge-tools.js';
export function knowledgeBulkToolbar(visible) {
  if (S.ui.currentUser?.role === 'viewer') return '';
  const selected = (S.ui.knowledgeSelection || []).filter(id => D().knowledgeNotes.some(note => note.id === id));
  if (!visible.length && !selected.length) return '';
  return `<div class="knowledge-bulk" role="group" aria-label="Note selection"><button class="btn btn-ghost btn-sm" data-a="selectKnowledgePage" data-ids="${esc(visible.map(note => note.id).join(','))}" ${!visible.length ? 'disabled' : ''}>Select page</button>${
    selected.length
      ? `<span class="num">${selected.length}</span><button class="btn btn-ghost btn-sm" data-a="clearKnowledgeSelection">Clear selection</button><button class="btn btn-secondary btn-sm" data-a="moveKnowledgeNote">Move selected notes</button><button class="btn btn-danger-ghost btn-sm" data-a="trashKnowledgeSelection">Move to trash</button>`
      : ''
  }</div>`;
}
export function knowledgeFolderBulk() {
  if (S.ui.currentUser?.role === 'viewer') return '';
  const ids = S.ui.knowledgeFolderSelection || [];
  const folderIndex = new Map(D().knowledgeFolders.map(folder => [folder.id, folder]));
  return `<div class="knowledge-folder-bulk"><button class="btn btn-ghost btn-sm" data-a="organizeKnowledgeFolders" aria-pressed="${!!S.ui.knowledgeOrganize}">Organize folders</button>${
    S.ui.knowledgeOrganize && ids.length
      ? `<label><span class="sr">Move selected folders</span><select class="select" data-in="knowledgeBulkFolderMove"><option value="" disabled selected>Move selected folders</option><option value="root">Root folder</option>${D()
          .knowledgeFolders.filter(folder => !folderTrail(folder.id, folderIndex).some(item => ids.includes(item.id)))
          .map(
            folder =>
              `<option value="${esc(folder.id)}" translate="no">${esc(
                folderTrail(folder.id, folderIndex)
                  .map(f => f.name)
                  .join(' / '),
              )}</option>`,
          )
          .join('')}</select></label>`
      : ''
  }</div>`;
}
