import { D, S } from '../core/store.js';
import { esc } from '../core/utils.js';
import { folderTrail } from '../shared/knowledge-tools.js';
import { collectionSelection } from './collection-layout.js';
export function knowledgeBulkToolbar(visible) {
  if (S.ui.currentUser?.role === 'viewer') return '';
  const known = new Set(D().knowledgeNotes.map(note => note.id));
  const selected = new Set((S.ui.knowledgeSelection || []).filter(id => known.has(id)));
  const visibleIds = new Set(visible.map(note => note.id));
  const pageSelected = visible.length > 0 && visible.every(note => selected.has(note.id));
  const hiddenCount = [...selected].filter(id => !visibleIds.has(id)).length;
  if (!visible.length && !selected.size) return '';
  return collectionSelection(
    `<button class="btn btn-ghost btn-sm" data-a="selectKnowledgePage" data-ids="${esc(visible.map(note => note.id).join(','))}" aria-pressed="${pageSelected}" ${!visible.length ? 'disabled' : ''}>${pageSelected ? 'Deselect page' : 'Select page'}</button>${
      selected.size
        ? `<span class="knowledge-selection-count" role="status"><span>Selected notes</span>: <b>${selected.size}</b>${hiddenCount ? `<span class="hint"> · ${hiddenCount} <span>outside this page</span></span>` : ''}</span><button class="btn btn-ghost btn-sm" data-a="clearKnowledgeSelection">Clear selection</button><button class="btn btn-secondary btn-sm" data-a="moveKnowledgeNote">Move selected notes</button><button class="btn btn-danger-ghost btn-sm" data-a="trashKnowledgeSelection">Move to trash</button>`
        : ''
    }`,
    'Note selection',
    !!selected.size,
    'knowledge-bulk',
  );
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
