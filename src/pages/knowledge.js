import { ago, esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { D, S } from '../core/store.js';
import { empty } from '../ui/helpers.js';
import { knowledgeView } from '../shared/knowledge-view.js';
import { folderTrail } from '../shared/knowledge-tools.js';
import { knowledgePreferences } from '../core/knowledge-preferences.js';
import { knowledgeExcerpt } from '../shared/knowledge-search.js';
import { highlightKnowledge } from '../ui/knowledge-highlight.js';
import { knowledgeBulkToolbar, knowledgeFolderBulk } from '../ui/knowledge-bulk.js';
import { knowledgeServerPage } from '../core/knowledge-server-search.js';
import { t } from '../core/i18n.js';
import { KNOWLEDGE_FILE_ACCEPT } from '../shared/knowledge-import.js';

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
    const parent = byId.has(folder.parentId) ? folder.parentId : '';
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(folder);
  });
  for (const list of children.values()) list.sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' }));
  const counts = new Map();
  const normalizedQuery = String(query || '')
    .trim()
    .toLocaleLowerCase();
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
    if (
      !normalizedQuery ||
      String(folder?.name || '')
        .toLocaleLowerCase()
        .includes(normalizedQuery)
    ) {
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
        // While filtering, keep matching descendants visible so a deep folder can be found.
        const isCollapsed = !normalizedQuery && collapsed[folder.id] === true;
        const nested = !isCollapsed ? render(folder.id, depth + 1, nextSeen) : '';
        const actions = readOnly
          ? ''
          : `<span class="knowledge-folder-actions"><button class="ibtn ibtn-xs" data-a="renameKnowledgeFolder" data-folder="${folder.id}" aria-label="Rename folder" title="Rename folder">${ic('pencil', 12)}</button><button class="ibtn ibtn-xs" data-a="deleteKnowledgeFolder" data-folder="${folder.id}" aria-label="Delete folder" title="Delete folder">${ic('trash-2', 12)}</button></span>`;
        const toggle = hasChildren
          ? `<button class="ibtn ibtn-xs knowledge-folder-toggle" data-a="toggleKnowledgeFolder" data-folder="${folder.id}" aria-label="${isCollapsed ? 'Expand folder' : 'Collapse folder'}" aria-expanded="${!isCollapsed}" title="${isCollapsed ? 'Expand folder' : 'Collapse folder'}">${ic(isCollapsed ? 'chevron-right' : 'chevron-down', 13)}</button>`
          : '<span class="knowledge-folder-toggle-spacer" aria-hidden="true"></span>';
        const selectFolder =
          !readOnly && S.ui.knowledgeOrganize
            ? `<input type="checkbox" data-in="knowledgeFolderSelect" data-id="${esc(folder.id)}" aria-label="Select folder" ${(S.ui.knowledgeFolderSelection || []).includes(folder.id) ? 'checked' : ''}>`
            : '';
        return `<div class="knowledge-folder-node"><div class="knowledge-folder-line">${selectFolder}${toggle}<button draggable="${!readOnly}" data-knowledge-drag="folder" class="knowledge-folder${activeId === folder.id ? ' on' : ''}" data-a="setKnowledgeFolder" data-folder="${folder.id}" style="--folder-depth:${Math.min(depth, 5)}" aria-current="${activeId === folder.id ? 'page' : 'false'}">${ic(hasChildren && !isCollapsed ? 'folder-open' : 'folder', 14)}<span class="trunc" translate="no">${esc(folder.name)}</span><span class="knowledge-folder-count">${counts.get(folder.id) || 0}</span></button>${actions}</div>${nested}</div>`;
      })
      .join('');
  return render();
}

function notePreviewCard(note, folder, readOnly) {
  const tags = (note.tags || []).filter(Boolean).slice(0, 3);
  const excerpt = knowledgeExcerpt(note, S.ui.knowledgeQuery);
  return `<article class="knowledge-preview-card" draggable="${!readOnly}" data-knowledge-drag="note" data-id="${note.id}">${readOnly ? '' : `<label class="knowledge-note-select"><input type="checkbox" data-in="knowledgeSelect" data-id="${note.id}" aria-label="Select note" ${(S.ui.knowledgeSelection || []).includes(note.id) ? 'checked' : ''}></label>`}<button class="knowledge-preview-open" data-a="openKnowledgeNote" data-id="${note.id}">
    <div class="knowledge-preview-head"><span class="knowledge-note-icon">${ic('file-text', 16)}</span><strong class="trunc" translate="no">${highlightKnowledge(note.title || 'Untitled note', S.ui.knowledgeQuery)}</strong><span class="knowledge-note-time">${ago(noteTime(note.updatedAt))}</span></div>
    <p class="knowledge-preview-excerpt" ${excerpt ? 'translate="no"' : ''}>${highlightKnowledge(excerpt || 'No summary', S.ui.knowledgeQuery)}</p>
    <div class="knowledge-preview-meta">${folder ? `<span translate="no">${ic('folder', 11)}${esc(folder.name)}</span>` : `<span>${ic('folder-open', 11)}No folder</span>`}${tags.length ? `<span class="knowledge-preview-tags">${tags.map(tag => `<span class="knowledge-tag" translate="no">${esc(tag)}</span>`).join('')}</span>` : ''}</div>
  </button>${readOnly ? '' : `<button class="ibtn ibtn-xs knowledge-preview-star" data-a="toggleKnowledgeFavorite" data-id="${note.id}" aria-label="${note.favorite ? 'Remove from favorites' : 'Add to favorites'}" aria-pressed="${!!note.favorite}" style="${note.favorite ? 'color:var(--amber)' : ''}">${ic('star', 13)}</button>`}</article>`;
}

function folderPath(folderId, folders) {
  const byId = new Map(folders.map(folder => [folder.id, folder]));
  const path = [];
  const seen = new Set();
  let current = byId.get(folderId);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current);
    current = byId.get(current.parentId);
  }
  return path;
}

function folderLabel(folderFilter, folders) {
  if (folderFilter === 'recent') return 'Recently opened';
  if (folderFilter === 'favorites') return 'Favorites';
  if (folderFilter === 'root') return 'No folder';
  if (folderFilter === 'all') return 'All notes';
  return folders.find(folder => folder.id === folderFilter)?.name || 'All notes';
}

export function pageKnowledge() {
  knowledgePreferences();
  const { notes, folders } = knowledgeData();
  const folderFilter = S.ui.knowledgeFolder || 'all';
  const readOnly = S.ui.currentUser?.role === 'viewer';
  const view = knowledgeView(notes, {
    query: S.ui.knowledgeQuery,
    folder: folderFilter,
    tag: S.ui.knowledgeTag,
    sort: S.ui.knowledgeSort || 'updated',
    limit: 60,
    offset: S.ui.knowledgeOffset || 0,
    recent: S.ui.knowledgeRecent || [],
    folders,
  });
  const indexed = knowledgeServerPage({
    query: S.ui.knowledgeQuery || '',
    folder: folderFilter,
    tag: S.ui.knowledgeTag || '',
    sort: S.ui.knowledgeSort || 'updated',
    offset: view.start,
  });
  const { active: selected } = view;
  const byId = new Map(notes.map(note => [note.id, note]));
  const { total, hasMore, start } = indexed || view;
  const visible = indexed ? indexed.ids.map(id => byId.get(id)).filter(Boolean) : view.visible;
  const active = selected;
  S.ui.knowledgeActive = active?.id || null;
  const currentPath = folderFilter !== 'all' && folderFilter !== 'root' && folderFilter !== 'favorites' ? folderPath(folderFilter, folders) : [];
  const crumbs = [
    { label: 'Knowledge base', folder: 'all', translate: true },
    ...(folderFilter === 'favorites'
      ? [{ label: 'Favorites', folder: 'favorites', translate: true }]
      : folderFilter === 'root'
        ? [{ label: 'No folder', folder: 'root', translate: true }]
        : currentPath.map(folder => ({ label: folder.name, folder: folder.id, translate: false }))),
  ]
    .map(
      (crumb, index, all) =>
        `${index === all.length - 1 ? '<span class="knowledge-crumb-current"' : `<button class="knowledge-crumb" data-a="setKnowledgeFolder" data-folder="${crumb.folder}"`} ${crumb.translate ? '' : 'translate="no"'}>${esc(crumb.label)}${index === all.length - 1 ? '</span>' : '</button>'}${index === all.length - 1 ? '' : `<span class="knowledge-crumb-sep">${ic('chevron-right', 13)}</span>`}`,
    )
    .join('');
  const activeFolder = folders.find(folder => folder.id === folderFilter);
  const folderMove =
    activeFolder && !readOnly
      ? `<label class="knowledge-folder-move"><span>Move folder to</span><select class="select" data-in="knowledgeMoveFolder" data-id="${activeFolder.id}"><option value="">Root folder</option>${folders
          .filter(folder => !folderTrail(folder.id, folders).some(item => item.id === activeFolder.id))
          .map(
            folder =>
              `<option value="${esc(folder.id)}" ${activeFolder.parentId === folder.id ? 'selected' : ''} translate="no">${esc(
                folderTrail(folder.id, folders)
                  .map(item => item.name)
                  .join(' / '),
              )}</option>`,
          )
          .join('')}</select></label>`
      : '';

  return `<div class="knowledge-shell${S.ui.knowledgeMobileFolders ? ' folders-open' : ''}${S.ui.knowledgeOrganize ? ' organizing-folders' : ''}">
    ${S.ui.knowledgeMobileFolders ? '<button class="knowledge-folder-scrim" data-a="toggleKnowledgeMobileFolders" aria-label="Close folders"></button>' : ''}
    <aside class="knowledge-sidebar">
      <div class="knowledge-sidebar-head">
        <div class="knowledge-head-main"><div class="knowledge-title-block"><span class="knowledge-pane-kicker">Folders</span><p>${notes.length} notes · ${folders.length} folders</p></div><button class="ibtn knowledge-mobile-folder-button" data-a="toggleKnowledgeMobileFolders" aria-label="Close folders">${ic('x', 18)}</button></div>
        ${readOnly ? '' : `<div class="knowledge-head-actions"><button class="ibtn" data-a="newKnowledgeFolder" aria-label="New folder" data-tip="New folder">${ic('folder-plus', 16)}</button></div>`}
        <div class="knowledge-folder-toolbar"><button class="ibtn ibtn-xs knowledge-folder-section-toggle" data-a="toggleKnowledgeFolderNav" aria-label="${S.ui.knowledgeFolderNavOpen === false ? 'Expand folders' : 'Collapse folders'}" aria-expanded="${S.ui.knowledgeFolderNavOpen !== false}" title="${S.ui.knowledgeFolderNavOpen === false ? 'Expand folders' : 'Collapse folders'}">${ic(S.ui.knowledgeFolderNavOpen === false ? 'chevron-right' : 'chevron-down', 13)}</button><span class="label">Knowledge folders</span><span class="sp"></span><button class="ibtn ibtn-xs" data-a="expandKnowledgeFolders" aria-label="Expand all" title="Expand all">${ic('chevron-down', 13)}</button><button class="ibtn ibtn-xs" data-a="collapseKnowledgeFolders" aria-label="Collapse all" title="Collapse all">${ic('chevron-up', 13)}</button></div>
        ${S.ui.knowledgeFolderNavOpen === false ? '' : `<div class="inwrap knowledge-folder-search">${ic('search', 13)}<input class="input" data-in="knowledgeFolderQuery" value="${esc(S.ui.knowledgeFolderQuery || '')}" placeholder="Filter folders" aria-label="Filter folders"></div>`}
        ${S.ui.knowledgeFolderNavOpen === false ? '' : `<nav class="knowledge-folders" aria-label="Knowledge folders"><button class="knowledge-folder${folderFilter === 'all' ? ' on' : ''}" data-a="setKnowledgeFolder" data-folder="all" aria-current="${folderFilter === 'all' ? 'page' : 'false'}">${ic('library', 14)}<span class="trunc">All notes</span><span class="knowledge-folder-count">${notes.length}</span></button><button class="knowledge-folder${folderFilter === 'favorites' ? ' on' : ''}" data-a="setKnowledgeFolder" data-folder="favorites" aria-current="${folderFilter === 'favorites' ? 'page' : 'false'}">${ic('star', 14)}<span class="trunc">Favorites</span><span class="knowledge-folder-count">${notes.filter(note => note.favorite).length}</span></button><button class="knowledge-folder${folderFilter === 'root' ? ' on' : ''}" data-a="setKnowledgeFolder" data-folder="root" aria-current="${folderFilter === 'root' ? 'page' : 'false'}">${ic('folder-open', 14)}<span class="trunc">No folder</span><span class="knowledge-folder-count">${notes.filter(note => !note.folderId).length}</span></button>${folderTree(folders, notes, folderFilter, readOnly, S.ui.knowledgeCollapsedFolders || {}, S.ui.knowledgeFolderQuery || '')}</nav>`}
        <button class="knowledge-folder${folderFilter === 'recent' ? ' on' : ''}" data-a="setKnowledgeFolder" data-folder="recent">${ic('history', 14)}Recently opened</button>
        ${knowledgeFolderBulk()}
        ${S.ui.knowledgeImportStatus ? `<div class="knowledge-import-status" role="status">${esc(S.ui.knowledgeImportStatus)}</div>` : ''}
      </div>
    </aside>
    <div class="knowledge-main">
      <section class="knowledge-content" aria-label="Knowledge notes">
        <button class="btn btn-secondary knowledge-mobile-folder-button" data-a="toggleKnowledgeMobileFolders" aria-expanded="${!!S.ui.knowledgeMobileFolders}">${ic('folder', 16)}Folders<span class="trunc" translate="no"> · ${esc(activeFolder ? activeFolder.name : t(folderLabel(folderFilter, folders)))}</span></button>
        <div class="knowledge-breadcrumbs" aria-label="Breadcrumbs">${crumbs}</div>${folderMove ? `<details class="knowledge-folder-options"><summary>Folder options</summary>${folderMove}</details>` : ''}
        <div class="knowledge-saved-views"><button class="btn btn-ghost btn-sm" data-a="saveKnowledgeView">${ic('bookmark-plus', 14)}Save search</button>${(S.ui.knowledgeSavedViews || []).map(view => `<span class="knowledge-saved-view"><button data-a="applyKnowledgeView" data-id="${esc(view.id)}" translate="no">${esc(view.name)}</button><button data-a="removeKnowledgeView" data-id="${esc(view.id)}" aria-label="Remove saved search">${ic('x', 12)}</button></span>`).join('')}</div>
        <div class="knowledge-content-head"><div><h1 ${activeFolder ? 'translate="no"' : ''}>${esc(folderLabel(folderFilter, folders))}</h1><p><span>${visible.length} of ${total} notes</span></p></div><div class="knowledge-content-actions">${S.ui.knowledgeQuery ? `<button class="btn btn-ghost btn-sm" data-a="clearKnowledgeQuery">${ic('x', 13)}Clear search</button>` : ''}${readOnly ? '' : `<button class="btn btn-secondary btn-sm" data-a="chooseKnowledgeFiles" ${S.ui.knowledgeImportReading ? 'disabled' : ''}>${ic('file-up', 14)}Import notes</button><input id="knowledge-import-files" type="file" accept="${KNOWLEDGE_FILE_ACCEPT}" multiple hidden data-in="importKnowledgeMarkdown"><button class="btn btn-primary btn-sm" data-a="newKnowledgeNote">${ic('plus', 14)}New note</button>`}</div></div>
        ${readOnly ? '' : `<p class="knowledge-import-hint" role="status">${S.ui.knowledgeImportReading ? 'Reading note files…' : 'Drop TXT or Markdown files here, or choose Import notes.'}</p>`}
        <div class="knowledge-content-toolbar"><div class="inwrap knowledge-main-search">${ic('search', 14)}<input class="input" data-in="knowledgeQuery" value="${esc(S.ui.knowledgeQuery || '')}" placeholder="Search in this folder" aria-label="Search knowledge base"></div><div class="knowledge-tag-filter"><label class="sr" for="knowledge-tag-filter">Tags</label><select class="select" id="knowledge-tag-filter" data-in="knowledgeTag"><option value="">All tags</option>${[
          ...new Set(notes.flatMap(note => note.tags || [])),
        ]
          .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
          .map(tag => `<option value="${esc(tag)}" ${S.ui.knowledgeTag === tag ? 'selected' : ''} translate="no">${esc(tag)}</option>`)
          .join(
            '',
          )}</select></div><label class="knowledge-sort-filter"><span class="sr">Sort notes</span><select class="select" data-in="knowledgeSort"><option value="updated" ${S.ui.knowledgeSort !== 'title' ? 'selected' : ''}>Recently updated</option><option value="title" ${S.ui.knowledgeSort === 'title' ? 'selected' : ''}>Title</option></select></label></div>
        ${knowledgeBulkToolbar(visible)}
        ${
          visible.length
            ? `<div class="knowledge-preview-grid">${visible
                .map(note =>
                  notePreviewCard(
                    note,
                    folders.find(folder => folder.id === note.folderId),
                    readOnly,
                  ),
                )
                .join('')}</div>`
            : empty('search-x', 'No results found', 'No notes match your filters.')
        }
        ${total > 60 ? `<nav class="knowledge-pagination" aria-label="Note pages"><button class="btn btn-secondary" data-a="knowledgePage" data-offset="${Math.max(0, start - 60)}" ${!start ? 'disabled' : ''}>Previous</button><span class="num">${start + 1}–${start + visible.length} / ${total}</span><button class="btn btn-secondary" data-a="knowledgePage" data-offset="${start + 60}" ${!hasMore ? 'disabled' : ''}>Next</button></nav>` : ''}
      </section>
    </div>
  </div>`;
}
