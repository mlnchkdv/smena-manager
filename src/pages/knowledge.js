import { ago, esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { D, S, mem } from '../core/store.js';
import { empty } from '../ui/helpers.js';
import { noteEditor } from '../ui/knowledge-editor.js';
import { knowledgeView } from '../shared/knowledge-view.js';

const noteTime = value => {
  const parsed = typeof value === 'number' ? value : Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : Date.now();
};

const knowledgeData = () => ({
  notes: Array.isArray(D().knowledgeNotes) ? D().knowledgeNotes : [],
  folders: Array.isArray(D().knowledgeFolders) ? D().knowledgeFolders : [],
});

function folderTree(folders, notes, activeId, readOnly, collapsed = {}, query = '') {
  const directCounts = new Map(folders.map(folder => [folder.id, 0]));
  notes.forEach(note => note.folderId && directCounts.set(note.folderId, (directCounts.get(note.folderId) || 0) + 1));
  const children = new Map();
  const byId = new Map(folders.map(folder => [folder.id, folder]));
  folders.forEach(folder => {
    const parent = folders.some(item => item.id === folder.parentId) ? folder.parentId : '';
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(folder);
  });
  for (const list of children.values()) list.sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' }));
  const counts = new Map();
  const normalizedQuery = String(query || '').trim().toLocaleLowerCase();
  const countDescendants = (id, seen = new Set()) => {
    if (counts.has(id)) return counts.get(id);
    if (seen.has(id)) return 0;
    const nextSeen = new Set(seen).add(id);
    const total = (directCounts.get(id) || 0) + (children.get(id) || []).reduce((sum, child) => sum + countDescendants(child.id, nextSeen), 0);
    counts.set(id, total);
    return total;
  };
  folders.forEach(folder => countDescendants(folder.id));
  const matching = new Map();
  const branchMatches = (id, seen = new Set()) => {
    if (matching.has(id)) return matching.get(id);
    if (seen.has(id)) return false;
    const nextSeen = new Set(seen).add(id);
    const folder = byId.get(id);
    if (!normalizedQuery || String(folder?.name || '').toLocaleLowerCase().includes(normalizedQuery)) {
      matching.set(id, true);
      return true;
    }
    const result = (children.get(id) || []).some(child => branchMatches(child.id, nextSeen));
    matching.set(id, result);
    return result;
  };
  const render = (parent = '', depth = 0, seen = new Set()) =>
    (children.get(parent) || [])
      .filter(folder => !seen.has(folder.id) && branchMatches(folder.id, seen))
      .map(folder => {
        const nextSeen = new Set(seen).add(folder.id);
        const childFolders = (children.get(folder.id) || []).filter(child => !nextSeen.has(child.id));
        const hasChildren = childFolders.length > 0;
        const isCollapsed = collapsed[folder.id] === true;
        const nested = !isCollapsed ? render(folder.id, depth + 1, nextSeen) : '';
        const actions = readOnly ? '' : `<span class="knowledge-folder-actions"><button class="ibtn ibtn-xs" data-a="renameKnowledgeFolder" data-folder="${folder.id}" aria-label="Rename folder" title="Rename folder">${ic('pencil', 12)}</button><button class="ibtn ibtn-xs" data-a="deleteKnowledgeFolder" data-folder="${folder.id}" aria-label="Delete folder" title="Delete folder">${ic('trash-2', 12)}</button></span>`;
        const toggle = hasChildren ? `<button class="ibtn ibtn-xs knowledge-folder-toggle" data-a="toggleKnowledgeFolder" data-folder="${folder.id}" aria-label="${isCollapsed ? 'Expand folder' : 'Collapse folder'}" aria-expanded="${!isCollapsed}" title="${isCollapsed ? 'Expand folder' : 'Collapse folder'}">${ic(isCollapsed ? 'chevron-right' : 'chevron-down', 13)}</button>` : '<span class="knowledge-folder-toggle-spacer" aria-hidden="true"></span>';
        return `<div class="knowledge-folder-node"><div class="knowledge-folder-line">${toggle}<button class="knowledge-folder${activeId === folder.id ? ' on' : ''}" data-a="setKnowledgeFolder" data-folder="${folder.id}" style="--folder-depth:${Math.min(depth, 5)}" aria-current="${activeId === folder.id ? 'page' : 'false'}">${ic(hasChildren && !isCollapsed ? 'folder-open' : 'folder', 14)}<span class="trunc" translate="no">${esc(folder.name)}</span><span class="knowledge-folder-count">${counts.get(folder.id) || 0}</span></button>${actions}</div>${nested}</div>`;
      })
      .join('');
  return render();
}

function noteItem(note, active, folder, readOnly) {
  const author = mem(note.updatedBy || note.createdBy);
  const tags = (note.tags || []).filter(Boolean).slice(0, 2);
  return `<div class="knowledge-note-row ${active ? 'on' : ''}">
    <button class="knowledge-note" data-a="openKnowledgeNote" data-id="${note.id}" ${active ? 'aria-current="page"' : ''}>
      <span class="knowledge-note-icon">${ic('file-text', 15)}</span>
      <span class="grow"><b class="trunc" ${note.title ? 'translate="no"' : ''}>${esc(note.title || 'Untitled note')}</b><span class="trunc" ${note.summary || folder?.name ? 'translate="no"' : ''}>${esc(note.summary || folder?.name || 'No summary')}</span>${tags.length ? `<span class="knowledge-note-tags">${tags.map(tag => `<span class="knowledge-tag" translate="no">${esc(tag)}</span>`).join('')}</span>` : ''}</span>
      <span class="knowledge-note-time">${ago(noteTime(note.updatedAt))}</span>
    </button>
    ${readOnly ? '' : `<button class="ibtn ibtn-xs knowledge-star" data-a="toggleKnowledgeFavorite" data-id="${note.id}" aria-label="${note.favorite ? 'Remove from favorites' : 'Add to favorites'}" aria-pressed="${!!note.favorite}" style="${note.favorite ? 'color:var(--amber)' : ''}">${ic('star', 13)}</button>`}
    ${author ? `<span class="sr">Updated by ${esc(author.name)}</span>` : ''}
  </div>`;
}

export function pageKnowledge() {
  const { notes, folders } = knowledgeData();
  const folderFilter = S.ui.knowledgeFolder || 'all';
  const readOnly = S.ui.currentUser?.role === 'viewer';
  const drawerMode = S.ui.knowledgePresentation === 'drawer';
  const { visible, active: selected, total, hasMore } = knowledgeView(notes, {
    query: S.ui.knowledgeQuery,
    folder: folderFilter,
    activeId: S.ui.knowledgeActive,
    tag: S.ui.knowledgeTag,
    sort: S.ui.knowledgeSort || 'updated',
    limit: S.ui.knowledgeLimit || 200,
  });
  const active = drawerMode ? null : selected;
  S.ui.knowledgeActive = active?.id || null;

  return `<div class="knowledge-shell">
    <aside class="knowledge-sidebar">
      <div class="knowledge-sidebar-head">
        <div class="knowledge-head-main"><div class="knowledge-title-block"><h1>Knowledge base</h1><p>${notes.length} notes</p></div><div class="knowledge-view-toggle" role="group" aria-label="Knowledge base view"><button class="knowledge-view-option ${S.ui.knowledgePresentation !== 'drawer' ? 'on' : ''}" data-a="setKnowledgePresentation" data-view="split" aria-label="Split view" aria-pressed="${S.ui.knowledgePresentation !== 'drawer'}" title="Split view">${ic('columns-3', 15)}<span>Split</span></button><button class="knowledge-view-option ${S.ui.knowledgePresentation === 'drawer' ? 'on' : ''}" data-a="setKnowledgePresentation" data-view="drawer" aria-label="Panel view" aria-pressed="${S.ui.knowledgePresentation === 'drawer'}" title="Panel view">${ic('panel-right-open', 15)}<span>Panel</span></button></div></div>
        ${readOnly ? '' : `<div class="knowledge-head-actions"><label class="ibtn" aria-label="Import Markdown" data-tip="Import Markdown" style="cursor:pointer">${ic('file-up', 16)}<input type="file" accept=".md,.markdown,text/markdown,text/plain" multiple hidden data-in="importKnowledgeMarkdown"></label><button class="ibtn" data-a="newKnowledgeFolder" aria-label="New folder" data-tip="New folder">${ic('folder-plus', 16)}</button><button class="btn btn-primary btn-sm knowledge-new-note" data-a="newKnowledgeNote">${ic('plus', 14)}New note</button></div>`}
        <div class="inwrap">${ic('search', 14)}<input class="input" data-in="knowledgeQuery" value="${esc(S.ui.knowledgeQuery || '')}" placeholder="Search notes, tags, and content" aria-label="Search knowledge base"></div>
        <div class="knowledge-list-tools"><label class="sr" for="knowledge-folder-filter">Filter by folder</label><select class="select" id="knowledge-folder-filter" data-in="knowledgeFolder"><option value="all" ${folderFilter === 'all' ? 'selected' : ''}>All folders</option><option value="favorites" ${folderFilter === 'favorites' ? 'selected' : ''}>Favorites</option><option value="root" ${folderFilter === 'root' ? 'selected' : ''}>No folder</option>${folders.map(folder => `<option value="${folder.id}" ${folderFilter === folder.id ? 'selected' : ''} translate="no">${esc(folder.name)}</option>`).join('')}</select><label class="sr" for="knowledge-sort">Sort notes</label><select class="select knowledge-sort" id="knowledge-sort" data-in="knowledgeSort"><option value="updated" ${(S.ui.knowledgeSort || 'updated') === 'updated' ? 'selected' : ''}>Recently updated</option><option value="title" ${S.ui.knowledgeSort === 'title' ? 'selected' : ''}>By title</option></select></div>
        <div class="knowledge-folder-toolbar"><span class="label">Knowledge folders</span><span class="sp"></span><button class="ibtn ibtn-xs" data-a="expandKnowledgeFolders" aria-label="Expand all" title="Expand all">${ic('chevron-down', 13)}</button><button class="ibtn ibtn-xs" data-a="collapseKnowledgeFolders" aria-label="Collapse all" title="Collapse all">${ic('chevron-up', 13)}</button></div>
        <div class="inwrap knowledge-folder-search">${ic('search', 13)}<input class="input" data-in="knowledgeFolderQuery" value="${esc(S.ui.knowledgeFolderQuery || '')}" placeholder="Filter folders" aria-label="Filter folders"></div>
        <nav class="knowledge-folders" aria-label="Knowledge folders"><button class="knowledge-folder${folderFilter === 'all' ? ' on' : ''}" data-a="setKnowledgeFolder" data-folder="all" aria-current="${folderFilter === 'all' ? 'page' : 'false'}">${ic('library', 14)}<span class="trunc">All notes</span><span class="knowledge-folder-count">${notes.length}</span></button><button class="knowledge-folder${folderFilter === 'favorites' ? ' on' : ''}" data-a="setKnowledgeFolder" data-folder="favorites" aria-current="${folderFilter === 'favorites' ? 'page' : 'false'}">${ic('star', 14)}<span class="trunc">Favorites</span><span class="knowledge-folder-count">${notes.filter(note => note.favorite).length}</span></button><button class="knowledge-folder${folderFilter === 'root' ? ' on' : ''}" data-a="setKnowledgeFolder" data-folder="root" aria-current="${folderFilter === 'root' ? 'page' : 'false'}">${ic('folder-open', 14)}<span class="trunc">No folder</span><span class="knowledge-folder-count">${notes.filter(note => !note.folderId).length}</span></button>${folderTree(folders, notes, folderFilter, readOnly, S.ui.knowledgeCollapsedFolders || {}, S.ui.knowledgeFolderQuery || '')}</nav>
        <div class="knowledge-tag-filter"><label class="label" for="knowledge-tag-filter">Tags</label><select class="select" id="knowledge-tag-filter" data-in="knowledgeTag"><option value="">All tags</option>${[...new Set(notes.flatMap(note => note.tags || []))].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })).map(tag => `<option value="${esc(tag)}" ${S.ui.knowledgeTag === tag ? 'selected' : ''}>${esc(tag)}</option>`).join('')}</select></div>
        ${S.ui.knowledgeImportStatus ? `<div class="knowledge-import-status" role="status">${esc(S.ui.knowledgeImportStatus)}</div>` : ''}
      </div>
      <div class="knowledge-list" data-keep="knowledge-list">
        <div class="knowledge-list-summary"><span aria-label="${visible.length} of ${total} notes">${visible.length} / ${total}</span>${S.ui.knowledgeTag ? `<button class="knowledge-filter-chip" data-a="clearKnowledgeTag" aria-label="Clear tag">#${esc(S.ui.knowledgeTag)} ${ic('x', 11)}</button>` : ''}</div>
        ${
          visible.length
            ? visible
                .map(note =>
                  noteItem(
                    note,
                    active?.id === note.id,
                    folders.find(folder => folder.id === note.folderId),
                    readOnly,
                  ),
                )
                .join('')
            : `<div class="knowledge-list-empty">${ic('search-x', 18)}<span>No notes match your filters.</span></div>`
        }
        ${hasMore ? `<button class="btn btn-ghost btn-block knowledge-load-more" data-a="loadMoreKnowledge">${ic('chevrons-down', 14)}Show more <span class="muted">(${visible.length} / ${total})</span></button>` : ''}
      </div>
    </aside>
    <div class="knowledge-main">
      ${active ? noteEditor(active, folders, readOnly) : drawerMode && visible.length ? `<div class="knowledge-mode-placeholder">${ic('panel-right-open', 28)}<h2>Select a note</h2><p>Open a note from the list to read or edit it in a panel.</p></div>` : notes.length ? empty('search-x', 'No results found', 'No notes match your filters.') : empty('library-big', 'No notes yet', readOnly ? 'An editor can add the first note to this workspace.' : 'Create the first note for your team knowledge base.', readOnly ? '' : `<button class="btn btn-primary" data-a="newKnowledgeNote">${ic('plus', 14)}Create note</button>`, '', 1)}
    </div>
  </div>`;
}
