import { D, S } from '../core/store.js';
import { esc } from '../core/utils.js';
import { folderTrail } from '../shared/knowledge-tools.js';
export function knowledgeBulkToolbar(visible) {
  if (S.ui.currentUser?.role === 'viewer') return '';
  const selected = (S.ui.knowledgeSelection || []).filter(id => D().knowledgeNotes.some(note => note.id === id));
  return `<div class="knowledge-bulk" role="group" aria-label="Note selection"><button class="btn btn-ghost btn-sm" data-a="selectKnowledgePage" data-ids="${esc(visible.map(note => note.id).join(','))}">Select page</button>${
    selected.length
      ? `<span class="num">${selected.length}</span><button class="btn btn-ghost btn-sm" data-a="clearKnowledgeSelection">Clear selection</button><label><span class="sr">Move selected notes</span><select class="select" data-in="knowledgeBulkMove"><option value="" disabled selected>Move selected notes</option><option value="root">No folder</option>${D()
          .knowledgeFolders.map(
            folder =>
              `<option value="${esc(folder.id)}" translate="no">${esc(
                folderTrail(folder.id, D().knowledgeFolders)
                  .map(f => f.name)
                  .join(' / '),
              )}</option>`,
          )
          .join('')}</select></label><button class="btn btn-danger-ghost btn-sm" data-a="trashKnowledgeSelection">Move to trash</button>`
      : ''
  }</div>`;
}
export function knowledgeFolderBulk() {
  if (S.ui.currentUser?.role === 'viewer') return '';
  const ids = S.ui.knowledgeFolderSelection || [];
  return `<div class="knowledge-folder-bulk"><button class="btn btn-ghost btn-sm" data-a="organizeKnowledgeFolders" aria-pressed="${!!S.ui.knowledgeOrganize}">Organize folders</button>${
    S.ui.knowledgeOrganize && ids.length
      ? `<label><span class="sr">Move selected folders</span><select class="select" data-in="knowledgeBulkFolderMove"><option value="" disabled selected>Move selected folders</option><option value="root">Root folder</option>${D()
          .knowledgeFolders.filter(folder => !folderTrail(folder.id, D().knowledgeFolders).some(item => ids.includes(item.id)))
          .map(
            folder =>
              `<option value="${esc(folder.id)}" translate="no">${esc(
                folderTrail(folder.id, D().knowledgeFolders)
                  .map(f => f.name)
                  .join(' / '),
              )}</option>`,
          )
          .join('')}</select></label>`
      : ''
  }</div>`;
}
