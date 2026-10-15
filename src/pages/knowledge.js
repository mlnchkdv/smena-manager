import { ago, esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { D, S, mem } from '../core/store.js';
import { empty } from '../ui/helpers.js';
import { knowledgeRelations } from '../shared/knowledge-links.js';

const DEFAULT_CATEGORIES = ['General', 'Processes', 'Regulations', 'Projects', 'Research'];

const noteTime = value => {
  const parsed = typeof value === 'number' ? value : Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : Date.now();
};

const knowledgeData = () => ({
  notes: Array.isArray(D().knowledgeNotes) ? D().knowledgeNotes : [],
  folders: Array.isArray(D().knowledgeFolders) ? D().knowledgeFolders : [],
});

function noteMatches(note, query) {
  if (!query) return true;
  const haystack = [note.title, note.summary, note.formatted_markdown, ...(note.tags || [])].join(' ').toLowerCase();
  return haystack.includes(query);
}

function noteItem(note, active, folder, readOnly) {
  const author = mem(note.updatedBy || note.createdBy);
  return `<div class="knowledge-note-row ${active ? 'on' : ''}">
    <button class="knowledge-note" data-a="openKnowledgeNote" data-id="${note.id}" ${active ? 'aria-current="page"' : ''}>
      <span class="knowledge-note-icon">${ic('file-text', 15)}</span>
      <span class="grow"><b class="trunc">${esc(note.title || 'Untitled note')}</b><span class="trunc">${esc(note.summary || folder?.name || 'No summary')}</span></span>
      <span class="knowledge-note-time">${ago(noteTime(note.updatedAt))}</span>
    </button>
    ${readOnly ? '' : `<button class="ibtn ibtn-xs knowledge-star" data-a="toggleKnowledgeFavorite" data-id="${note.id}" aria-label="${note.favorite ? 'Remove from favorites' : 'Add to favorites'}" aria-pressed="${!!note.favorite}" style="${note.favorite ? 'color:var(--amber)' : ''}">${ic('star', 13)}</button>`}
    ${author ? `<span class="sr">Updated by ${esc(author.name)}</span>` : ''}
  </div>`;
}

function relationItem(note, title, missing = false) {
  const content = `<span class="knowledge-relation-icon">${ic(missing ? 'circle-help' : 'file-text', 14)}</span><span class="trunc">${esc(title)}</span>${missing ? '<span class="badge">Not found</span>' : ic('arrow-up-right', 13)}`;
  return missing
    ? `<div class="knowledge-relation is-missing">${content}</div>`
    : `<button class="knowledge-relation" data-a="openKnowledgeNote" data-id="${esc(note.id)}">${content}</button>`;
}

function noteRelations(note, notes) {
  const { outgoing, backlinks } = knowledgeRelations(notes, note);
  return `<section class="knowledge-relations" aria-label="Note connections">
    <h2>${ic('link-2', 16)}Connections</h2>
    <div class="knowledge-relations-grid">
      <div class="knowledge-relations-group">
        <h3>Outgoing links <span>${outgoing.length}</span></h3>
        <div class="knowledge-relations-list">${outgoing.length ? outgoing.map(item => relationItem(item.note, item.title, !item.note)).join('') : '<p>No outgoing links yet.</p>'}</div>
      </div>
      <div class="knowledge-relations-group">
        <h3>Backlinks <span>${backlinks.length}</span></h3>
        <div class="knowledge-relations-list">${backlinks.length ? backlinks.map(item => relationItem(item, item.title)).join('') : '<p>No backlinks yet.</p>'}</div>
      </div>
    </div>
  </section>`;
}

function noteEditor(note, folders, notes, readOnly) {
  const disabled = readOnly ? 'disabled' : '';
  const categories = [...new Set([...DEFAULT_CATEGORIES, note.category].filter(Boolean))];
  return `<section class="knowledge-editor" aria-label="Note editor">
    <div class="knowledge-editor-head">
      <div class="grow">
        <label class="sr" for="knowledge-title">Note title</label>
        <input class="knowledge-title" id="knowledge-title" value="${esc(note.title)}" data-in="knowledgeField" data-blur="knowledgeField" data-id="${note.id}" data-field="title" placeholder="Untitled note" ${disabled}>
        <div class="knowledge-meta">${ic('clock-3', 12)}<span>Updated ${ago(noteTime(note.updatedAt))}</span>${note.updatedBy && mem(note.updatedBy) ? `<span>· ${esc(mem(note.updatedBy).name)}</span>` : ''}</div>
      </div>
      ${readOnly ? `<span class="badge">${ic('eye', 12)}View only</span>` : `<button class="btn btn-danger-ghost btn-sm" data-a="deleteKnowledgeNote" data-id="${note.id}">${ic('trash-2', 13)}Delete</button>`}
    </div>
    <div class="knowledge-fields">
      <div class="field"><label class="label" for="knowledge-category">Category</label><select class="select" id="knowledge-category" data-in="knowledgeField" data-id="${note.id}" data-field="category" ${disabled}>${categories.map(value => `<option value="${esc(value)}" ${note.category === value ? 'selected' : ''}>${esc(value)}</option>`).join('')}</select></div>
      <div class="field"><label class="label" for="knowledge-folder">Folder</label><select class="select" id="knowledge-folder" data-in="knowledgeField" data-id="${note.id}" data-field="folderId" ${disabled}><option value="">No folder</option>${folders.map(folder => `<option value="${folder.id}" ${note.folderId === folder.id ? 'selected' : ''}>${esc(folder.name)}</option>`).join('')}</select></div>
    </div>
    <div class="field"><label class="label" for="knowledge-summary">Summary</label><input class="input" id="knowledge-summary" value="${esc(note.summary || '')}" data-in="knowledgeField" data-blur="knowledgeField" data-id="${note.id}" data-field="summary" placeholder="A short description of the note" ${disabled}></div>
    <div class="field"><label class="label" for="knowledge-tags">Tags</label><input class="input" id="knowledge-tags" value="${esc((note.tags || []).join(', '))}" data-in="knowledgeField" data-blur="knowledgeField" data-id="${note.id}" data-field="tags" placeholder="process, onboarding, team" ${disabled}><span class="hint">Separate tags with commas.</span></div>
    <div class="field knowledge-body-field"><label class="label" for="knowledge-body">Content</label><textarea class="textarea knowledge-body" id="knowledge-body" data-in="knowledgeField" data-id="${note.id}" data-field="formatted_markdown" placeholder="Write the note in Markdown. Use [[Note name]] to link related material." ${disabled}>${esc(note.formatted_markdown || '')}</textarea><span class="hint">Markdown and [[wiki links]] are stored as plain text and remain portable.</span></div>
    ${noteRelations(note, notes)}
  </section>`;
}

export function pageKnowledge() {
  const { notes, folders } = knowledgeData();
  const query = String(S.ui.knowledgeQuery || '')
    .trim()
    .toLowerCase();
  const folderFilter = S.ui.knowledgeFolder || 'all';
  const readOnly = S.ui.currentUser?.role === 'viewer';
  const filtered = notes
    .filter(note => noteMatches(note, query))
    .filter(note => folderFilter === 'all' || (folderFilter === 'root' ? !note.folderId : note.folderId === folderFilter))
    .sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite) || noteTime(b.updatedAt) - noteTime(a.updatedAt));
  const active = notes.find(note => note.id === S.ui.knowledgeActive) || filtered[0] || notes[0] || null;
  if (active && S.ui.knowledgeActive !== active.id) S.ui.knowledgeActive = active.id;

  return `<div class="knowledge-shell">
    <aside class="knowledge-sidebar">
      <div class="knowledge-sidebar-head">
        <div class="row"><div class="grow"><h1>Knowledge base</h1><p>${notes.length} notes</p></div>${readOnly ? '' : `<button class="ibtn" data-a="newKnowledgeFolder" aria-label="New folder" data-tip="New folder">${ic('folder-plus', 16)}</button><button class="btn btn-primary btn-sm" data-a="newKnowledgeNote">${ic('plus', 14)}New note</button>`}</div>
        <div class="inwrap">${ic('search', 14)}<input class="input" data-in="knowledgeQuery" value="${esc(S.ui.knowledgeQuery || '')}" placeholder="Search notes, tags, and content" aria-label="Search knowledge base"></div>
        <label class="sr" for="knowledge-folder-filter">Filter by folder</label><select class="select" id="knowledge-folder-filter" data-in="knowledgeFolder"><option value="all" ${folderFilter === 'all' ? 'selected' : ''}>All folders</option><option value="root" ${folderFilter === 'root' ? 'selected' : ''}>No folder</option>${folders.map(folder => `<option value="${folder.id}" ${folderFilter === folder.id ? 'selected' : ''}>${esc(folder.name)}</option>`).join('')}</select>
      </div>
      <div class="knowledge-list" data-keep="knowledge-list">
        ${
          filtered.length
            ? filtered
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
      </div>
    </aside>
    <div class="knowledge-main">
      ${active ? noteEditor(active, folders, notes, readOnly) : empty('library-big', 'No notes yet', readOnly ? 'An editor can add the first note to this workspace.' : 'Create the first note for your team knowledge base.', readOnly ? '' : `<button class="btn btn-primary" data-a="newKnowledgeNote">${ic('plus', 14)}Create note</button>`, '', 1)}
    </div>
  </div>`;
}
