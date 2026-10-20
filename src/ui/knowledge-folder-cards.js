import { esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { S } from '../core/store.js';
import { knowledgeFolderChildren } from '../shared/knowledge-folder-index.js';

export function knowledgeFolderCards(index, folder, readOnly) {
  if (S.ui.knowledgeShowFolders === false || (folder !== 'all' && !index.byId.has(folder))) return '';
  const parent = folder === 'all' ? null : folder;
  const children = index.children.get(parent) || [];
  if (!children.length && readOnly) return '';
  const page = knowledgeFolderChildren(index, parent, { query: S.ui.knowledgeFolderCardQuery, offset: S.ui.knowledgeFolderCardOffset });
  S.ui.knowledgeFolderCardOffset = page.start;
  return `<section class="knowledge-folder-browser" aria-label="Folder browser">
    <div class="knowledge-folder-browser-head"><h2>Folders</h2><span class="num">${page.total ? `${page.start + 1}–${page.start + page.folders.length} / ${page.total}` : '0'}</span><span class="sp"></span>${readOnly ? '' : `<button class="ibtn" data-a="newKnowledgeFolder" aria-label="New folder" title="New folder">${ic('folder-plus', 16)}</button>`}</div>
    ${children.length > 6 || S.ui.knowledgeFolderCardQuery ? `<div class="inwrap knowledge-folder-card-search">${ic('search', 14)}<input class="input" id="knowledge-subfolder-search" data-in="knowledgeFolderCardQuery" value="${esc(S.ui.knowledgeFolderCardQuery || '')}" placeholder="Find a subfolder" aria-label="Find a subfolder"></div>` : ''}
    ${page.folders.length ? `<div class="knowledge-folder-card-grid">${page.folders.map(item => `<button class="knowledge-folder-card" draggable="${!readOnly}" data-knowledge-drag="folder" data-a="setKnowledgeFolder" data-folder="${esc(item.id)}" title="${esc(item.name)}">${ic('folder', 19)}<span><strong translate="no">${esc(item.name)}</strong><span title="Note count includes subfolders">${index.counts.get(item.id) || 0} notes</span></span>${ic('chevron-right', 14)}</button>`).join('')}</div>` : `<p class="knowledge-folder-browser-empty">${S.ui.knowledgeFolderCardQuery ? 'No matching folders.' : 'No subfolders here.'}</p>`}
    ${page.total > 6 ? `<div class="knowledge-folder-card-pages" role="group" aria-label="Folder pages"><button class="btn btn-ghost btn-sm" data-a="knowledgeFolderCardPage" data-offset="${Math.max(0, page.start - 6)}" ${!page.start ? 'disabled' : ''}>${ic('chevron-left', 14)}Previous folders</button><button class="btn btn-ghost btn-sm" data-a="knowledgeFolderCardPage" data-offset="${page.start + 6}" ${!page.hasMore ? 'disabled' : ''}>Next folders${ic('chevron-right', 14)}</button></div>` : ''}
  </section>`;
}
