import { ago, esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { mem } from '../core/store.js';
import { relationsPanel } from './relations.js';

const DEFAULT_CATEGORIES = ['General', 'Processes', 'Regulations', 'Projects', 'Research'];

export function noteEditor(note, folders, readOnly) {
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

const noteTime = value => {
  const parsed = typeof value === 'number' ? value : Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : Date.now();
};
