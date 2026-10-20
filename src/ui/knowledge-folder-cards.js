import { esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { S } from '../core/store.js';
import { knowledgeFolderChildren } from '../shared/knowledge-folder-index.js';

export function knowledgeFolderCards(index, folder, readOnly) {
  if (S.ui.knowledgeShowFolders === false || (folder !== 'all' && !index.byId.has(folder))) return '';
  const parent = folder === 'all' ? null : folder;
  const children = index.children.get(parent) || [];
  const pageSize = window.innerWidth <= 640 ? 4 : 6;
  if (!children.length && readOnly) return '';
  const page = knowledgeFolderChildren(index, parent, { query: S.ui.knowledgeFolderCardQuery, offset: S.ui.knowledgeFolderCardOffset, limit: pageSize });
  const selected = S.ui.knowledgeSelection?.length > 0 && !readOnly;
  const parentFolder = parent ? index.parents.get(parent) : null;
  S.ui.knowledgeFolderCardOffset = page.start;
  return `<section class="knowledge-folder-browser" aria-label="Folder browser">
    <div class="knowledge-folder-browser-head">${parent ? `<button class="ibtn" data-a="setKnowledgeFolder" data-folder="${esc(parentFolder || 'all')}" aria-label="Parent folder" title="Parent folder">${ic('arrow-up', 16)}</button>` : ''}<h2>Folders</h2><span class="num">${page.total ? `${page.start + 1}–${page.start + page.folders.length} / ${page.total}` : '0'}</span><span class="sp"></span>${readOnly ? '' : `<button class="ibtn" data-a="newKnowledgeFolder" aria-label="New folder" title="New folder">${ic('folder-plus', 16)}</button>`}</div>
    ${children.length > pageSize || S.ui.knowledgeFolderCardQuery ? `<div class="knowledge-folder-card-search"><div class="inwrap grow">${ic('search', 14)}<input class="input" id="knowledge-subfolder-search" data-in="knowledgeFolderCardQuery" value="${esc(S.ui.knowledgeFolderCardQuery || '')}" placeholder="Find a subfolder" aria-label="Find a subfolder"></div>${S.ui.knowledgeFolderCardQuery ? `<button class="ibtn" data-a="clearKnowledgeFolderCardQuery" aria-label="Clear folder search" title="Clear folder search">${ic('x', 16)}</button>` : ''}</div>` : ''}
    ${page.folders.length ? `<div class="knowledge-folder-card-grid">${page.folders.map(item => `<div class="knowledge-folder-tile"><button class="knowledge-folder-card" draggable="${!readOnly}" data-knowledge-drag="folder" data-a="setKnowledgeFolder" data-folder="${esc(item.id)}" title="${esc(item.name)}">${ic('folder', 19)}<span><strong translate="no">${esc(item.name)}</strong><span title="Note count includes subfolders">${index.counts.get(item.id) || 0} notes</span></span></button>${readOnly ? '' : `<details class="knowledge-folder-card-options"><summary aria-label="Folder actions" title="Folder actions">${ic('ellipsis', 16)}</summary><div><button data-a="newKnowledgeFolder" data-parent="${esc(item.id)}">${ic('folder-plus', 14)}New subfolder</button><button data-a="renameKnowledgeFolder" data-folder="${esc(item.id)}">${ic('pencil', 14)}Rename folder</button><button class="bad" data-a="deleteKnowledgeFolder" data-folder="${esc(item.id)}">${ic('trash-2', 14)}Delete folder</button></div></details>`}${selected ? `<button class="btn btn-ghost btn-sm knowledge-folder-receive" data-a="moveKnowledgeNote" data-folder="${esc(item.id)}">${ic('folder-input', 14)}Move selected here</button>` : ''}</div>`).join('')}</div>` : `<p class="knowledge-folder-browser-empty">${S.ui.knowledgeFolderCardQuery ? 'No matching folders.' : 'No subfolders here.'}</p>`}
    ${page.total > pageSize ? `<div class="knowledge-folder-card-pages" role="group" aria-label="Folder pages"><button class="btn btn-ghost btn-sm" data-a="knowledgeFolderCardPage" data-key="previous" data-offset="${Math.max(0, page.start - pageSize)}" ${!page.start ? 'disabled' : ''}>${ic('chevron-left', 14)}Previous folders</button><button class="btn btn-ghost btn-sm" data-a="knowledgeFolderCardPage" data-key="next" data-offset="${page.start + pageSize}" ${!page.hasMore ? 'disabled' : ''}>Next folders${ic('chevron-right', 14)}</button></div>` : ''}
  </section>`;
}
