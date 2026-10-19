import { ago, esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { D, S, mem } from '../core/store.js';
import { empty } from '../ui/helpers.js';
import { relationsPanel } from '../ui/relations.js';
import { knowledgeView } from '../shared/knowledge-view.js';

const DEFAULT_CATEGORIES = ['General', 'Processes', 'Regulations', 'Projects', 'Research'];

const noteTime = value => {
  const parsed = typeof value === 'number' ? value : Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : Date.now();
};

const knowledgeData = () => ({
  notes: Array.isArray(D().knowledgeNotes) ? D().knowledgeNotes : [],
  folders: Array.isArray(D().knowledgeFolders) ? D().knowledgeFolders : [],
});

function folderTree(folders, notes, activeId, readOnly) {
  const counts = new Map(folders.map(folder => [folder.id, 0]));
  notes.forEach(note => note.folderId && counts.set(note.folderId, (counts.get(note.folderId) || 0) + 1));
  const children = new Map();
  folders.forEach(folder => {
    const parent = folders.some(item => item.id === folder.parentId) ? folder.parentId : '';
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(folder);
  });
  for (const list of children.values()) list.sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' }));
  const render = (parent = '', depth = 0, seen = new Set()) =>
    (children.get(parent) || [])
      .filter(folder => !seen.has(folder.id))
      .map(folder => {
        const nextSeen = new Set(seen).add(folder.id);
        const nested = render(folder.id, depth + 1, nextSeen);
        const actions = readOnly ? '' : `<span class="knowledge-folder-actions"><button class="ibtn ibtn-xs" data-a="renameKnowledgeFolder" data-folder="${folder.id}" aria-label="Rename folder" title="Rename folder">${ic('pencil', 12)}</button><button class="ibtn ibtn-xs" data-a="deleteKnowledgeFolder" data-folder="${folder.id}" aria-label="Delete folder" title="Delete folder">${ic('trash-2', 12)}</button></span>`;
        return `<div class="knowledge-folder-node"><div class="knowledge-folder-line"><button class="knowledge-folder${activeId === folder.id ? ' on' : ''}" data-a="setKnowledgeFolder" data-folder="${folder.id}" style="--folder-depth:${Math.min(depth, 5)}" aria-current="${activeId === folder.id ? 'page' : 'false'}">${ic(nested ? 'folder-open' : 'folder', 14)}<span class="trunc" translate="no">${esc(folder.name)}</span><span class="knowledge-folder-count">${counts.get(folder.id) || 0}</span></button>${actions}</div>${nested}</div>`;
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

function noteEditor(note, folders, readOnly) {
  const disabled = readOnly ? 'disabled' : '';
  const categories = [...new Set([...DEFAULT_CATEGORIES, note.category].filter(Boolean))];
  return `<section class="knowledge-editor" aria-label="Note editor">
    <div class="knowledge-editor-head">
      <div class="grow">
        <label class="sr" for="knowledge-title">Note title</label>
        <input class="knowledge-title" id="knowledge-title" value="${esc(note.title)}" data-in="knowledgeField" data-blur="knowledgeField" data-id="${note.id}" data-field="title" placeholder="Untitled note" ${disabled}>
        <div class="knowledge-meta">${ic('clock-3', 12)}<span>Updated ${ago(noteTime(note.updatedAt))}</span>${note.updatedBy && mem(note.updatedBy) ? `<span translate="no">· ${esc(mem(note.updatedBy).name)}</span>` : ''}</div>
      </div>
      ${readOnly ? `<span class="badge">${ic('eye', 12)}View only</span>` : `<button class="btn btn-danger-ghost btn-sm" data-a="deleteKnowledgeNote" data-id="${note.id}">${ic('trash-2', 13)}Delete</button>`}
    </div>
    <div class="knowledge-fields">
      <div class="field"><label class="label" for="knowledge-category">Category</label><select class="select" id="knowledge-category" data-in="knowledgeField" data-id="${note.id}" data-field="category" ${disabled}>${categories.map(value => `<option value="${esc(value)}" ${note.category === value ? 'selected' : ''}>${esc(value)}</option>`).join('')}</select></div>
      <div class="field"><label class="label" for="knowledge-folder">Folder</label><select class="select" id="knowledge-folder" data-in="knowledgeField" data-id="${note.id}" data-field="folderId" ${disabled}><option value="">No folder</option>${folders.map(folder => `<option value="${folder.id}" ${note.folderId === folder.id ? 'selected' : ''} translate="no">${esc(folder.name)}</option>`).join('')}</select></div>
    </div>
    <div class="field"><label class="label" for="knowledge-summary">Summary</label><input class="input" id="knowledge-summary" value="${esc(note.summary || '')}" data-in="knowledgeField" data-blur="knowledgeField" data-id="${note.id}" data-field="summary" placeholder="A short description of the note" ${disabled}></div>
    <div class="field"><label class="label" for="knowledge-tags">Tags</label><input class="input" id="knowledge-tags" value="${esc((note.tags || []).join(', '))}" data-in="knowledgeField" data-blur="knowledgeField" data-id="${note.id}" data-field="tags" placeholder="process, onboarding, team" ${disabled}><span class="hint">Separate tags with commas.</span></div>
    <div class="field knowledge-body-field"><label class="label" for="knowledge-body">Content</label><textarea class="textarea knowledge-body" id="knowledge-body" data-in="knowledgeField" data-id="${note.id}" data-field="formatted_markdown" placeholder="Write the note in Markdown. Use [[Note name]] to link related material." ${disabled}>${esc(note.formatted_markdown || '')}</textarea><span class="hint">Markdown and [[wiki links]] are stored as plain text and remain portable.</span></div>
    ${relationsPanel(`note:${note.id}`)}
  </section>`;
}

export function pageKnowledge() {
  const { notes, folders } = knowledgeData();
  const folderFilter = S.ui.knowledgeFolder || 'all';
  const readOnly = S.ui.currentUser?.role === 'viewer';
  const { visible, active, total, hasMore } = knowledgeView(notes, {
    query: S.ui.knowledgeQuery,
    folder: folderFilter,
    activeId: S.ui.knowledgeActive,
    tag: S.ui.knowledgeTag,
    sort: S.ui.knowledgeSort || 'updated',
    limit: S.ui.knowledgeLimit || 200,
  });
  S.ui.knowledgeActive = active?.id || null;

  return `<div class="knowledge-shell">
    <aside class="knowledge-sidebar">
      <div class="knowledge-sidebar-head">
        <div class="row"><div class="grow"><h1>Knowledge base</h1><p>${notes.length} notes</p></div>${readOnly ? '' : `<label class="ibtn" aria-label="Import Markdown" data-tip="Import Markdown" style="cursor:pointer">${ic('file-up', 16)}<input type="file" accept=".md,.markdown,text/markdown,text/plain" multiple hidden data-in="importKnowledgeMarkdown"></label><button class="ibtn" data-a="newKnowledgeFolder" aria-label="New folder" data-tip="New folder">${ic('folder-plus', 16)}</button><button class="btn btn-primary btn-sm" data-a="newKnowledgeNote">${ic('plus', 14)}New note</button>`}</div>
        <div class="inwrap">${ic('search', 14)}<input class="input" data-in="knowledgeQuery" value="${esc(S.ui.knowledgeQuery || '')}" placeholder="Search notes, tags, and content" aria-label="Search knowledge base"></div>
        <div class="knowledge-list-tools"><label class="sr" for="knowledge-folder-filter">Filter by folder</label><select class="select" id="knowledge-folder-filter" data-in="knowledgeFolder"><option value="all" ${folderFilter === 'all' ? 'selected' : ''}>All folders</option><option value="favorites" ${folderFilter === 'favorites' ? 'selected' : ''}>Favorites</option><option value="root" ${folderFilter === 'root' ? 'selected' : ''}>No folder</option>${folders.map(folder => `<option value="${folder.id}" ${folderFilter === folder.id ? 'selected' : ''} translate="no">${esc(folder.name)}</option>`).join('')}</select><label class="sr" for="knowledge-sort">Sort notes</label><select class="select knowledge-sort" id="knowledge-sort" data-in="knowledgeSort"><option value="updated" ${(S.ui.knowledgeSort || 'updated') === 'updated' ? 'selected' : ''}>Recently updated</option><option value="title" ${S.ui.knowledgeSort === 'title' ? 'selected' : ''}>By title</option></select></div>
        <nav class="knowledge-folders" aria-label="Knowledge folders"><button class="knowledge-folder${folderFilter === 'all' ? ' on' : ''}" data-a="setKnowledgeFolder" data-folder="all" aria-current="${folderFilter === 'all' ? 'page' : 'false'}">${ic('library', 14)}<span class="trunc">All notes</span><span class="knowledge-folder-count">${notes.length}</span></button><button class="knowledge-folder${folderFilter === 'favorites' ? ' on' : ''}" data-a="setKnowledgeFolder" data-folder="favorites" aria-current="${folderFilter === 'favorites' ? 'page' : 'false'}">${ic('star', 14)}<span class="trunc">Favorites</span><span class="knowledge-folder-count">${notes.filter(note => note.favorite).length}</span></button><button class="knowledge-folder${folderFilter === 'root' ? ' on' : ''}" data-a="setKnowledgeFolder" data-folder="root" aria-current="${folderFilter === 'root' ? 'page' : 'false'}">${ic('folder-open', 14)}<span class="trunc">No folder</span><span class="knowledge-folder-count">${notes.filter(note => !note.folderId).length}</span></button>${folderTree(folders, notes, folderFilter, readOnly)}</nav>
        <div class="knowledge-tag-filter"><label class="label" for="knowledge-tag-filter">Tags</label><select class="select" id="knowledge-tag-filter" data-in="knowledgeTag"><option value="">All tags</option>${[...new Set(notes.flatMap(note => note.tags || []))].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })).map(tag => `<option value="${esc(tag)}" ${S.ui.knowledgeTag === tag ? 'selected' : ''}>${esc(tag)}</option>`).join('')}</select></div>
        ${S.ui.knowledgeImportStatus ? `<div class="knowledge-import-status" role="status">${esc(S.ui.knowledgeImportStatus)}</div>` : ''}
      </div>
      <div class="knowledge-list" data-keep="knowledge-list">
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
      ${active ? noteEditor(active, folders, readOnly) : notes.length ? empty('search-x', 'No results found', 'No notes match your filters.') : empty('library-big', 'No notes yet', readOnly ? 'An editor can add the first note to this workspace.' : 'Create the first note for your team knowledge base.', readOnly ? '' : `<button class="btn btn-primary" data-a="newKnowledgeNote">${ic('plus', 14)}Create note</button>`, '', 1)}
    </div>
  </div>`;
}
