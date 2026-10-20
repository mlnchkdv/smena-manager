import { ago, esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { mem } from '../core/store.js';
import { relationsPanel } from './relations.js';
import { knowledgeSaveLabel, knowledgeEditBlocked } from './knowledge-save-status.js';
import { S } from '../core/store.js';
import { renderKnowledgeMarkdown } from '../shared/knowledge-markdown.js';
import { knowledgeHistory } from './knowledge-history.js';
import { folderTrail } from '../shared/knowledge-tools.js';

const DEFAULT_CATEGORIES = ['General', 'Processes', 'Regulations', 'Projects', 'Research'];

export function noteEditor(note, folders, readOnly) {
  const conflict = knowledgeEditBlocked();
  const disabled = readOnly || conflict ? 'disabled' : '';
  const categories = [...new Set([...DEFAULT_CATEGORIES, note.category].filter(Boolean))];
  return `<section class="knowledge-editor" aria-label="Note editor">
    <div class="knowledge-editor-head">
      <div class="grow">
        <label class="sr" for="knowledge-title">Note title</label>
        <input class="knowledge-title" id="knowledge-title" value="${esc(note.title)}" data-in="knowledgeField" data-blur="knowledgeField" data-id="${note.id}" data-field="title" placeholder="Untitled note" ${disabled}>
        <div class="knowledge-meta">${ic('clock-3', 12)}<span>Updated ${ago(noteTime(note.updatedAt))}</span>${note.updatedBy && mem(note.updatedBy) ? `<span translate="no">· ${esc(mem(note.updatedBy).name)}</span>` : ''}<span class="knowledge-save-status" role="status" aria-live="polite" data-knowledge-save-status>${knowledgeSaveLabel()}</span></div>
      </div>
      ${readOnly ? `<span class="badge">${ic('eye', 12)}View only</span>` : `<button class="btn btn-danger-ghost btn-sm" data-a="deleteKnowledgeNote" data-id="${note.id}">${ic('trash-2', 13)}Delete</button>`}
    </div>
    ${conflict ? `<div class="alert danger" role="alert"><span>Resolve the saved conflict before editing this note.</span><button class="btn btn-secondary btn-sm" data-a="reviewSyncConflict">Review conflict</button><button class="btn btn-ghost btn-sm" data-a="downloadUnsyncedCopy">Export recovery copy</button></div>` : ''}
    <div class="knowledge-editor-section-title">Details</div><div class="knowledge-fields">
      <div class="field"><label class="label" for="knowledge-category">Category</label><select class="select" id="knowledge-category" data-in="knowledgeField" data-id="${note.id}" data-field="category" ${disabled}>${categories.map(value => `<option value="${esc(value)}" ${note.category === value ? 'selected' : ''}>${esc(value)}</option>`).join('')}</select></div>
      <div class="field"><label class="label" for="knowledge-folder">Folder</label><select class="select" id="knowledge-folder" data-in="knowledgeField" data-id="${note.id}" data-field="folderId" ${disabled}><option value="">No folder</option>${folders
        .map(
          folder =>
            `<option value="${folder.id}" ${note.folderId === folder.id ? 'selected' : ''} translate="no">${esc(
              folderTrail(folder.id, folders)
                .map(item => item.name)
                .join(' / '),
            )}</option>`,
        )
        .join('')}</select></div>
    </div>
    <div class="knowledge-fields knowledge-fields-secondary"><div class="field"><label class="label" for="knowledge-summary">Summary</label><input class="input" id="knowledge-summary" value="${esc(note.summary || '')}" data-in="knowledgeField" data-blur="knowledgeField" data-id="${note.id}" data-field="summary" placeholder="A short description of the note" ${disabled}></div>
    <div class="field"><label class="label" for="knowledge-tags">Tags</label><input class="input" id="knowledge-tags" value="${esc((note.tags || []).join(', '))}" data-in="knowledgeField" data-blur="knowledgeField" data-id="${note.id}" data-field="tags" placeholder="process, onboarding, team" ${disabled}><span class="hint">Separate tags with commas.</span></div></div>
    <div class="knowledge-editor-section-title">Content</div>
    <div class="knowledge-format-toolbar" role="group" aria-label="Text formatting" title="Ctrl/⌘ B · Bold / Ctrl/⌘ Enter · Preview / Ctrl/⌘ S · Save">${[
      ['bold', 'bold', 'Bold'],
      ['heading', 'heading', 'Heading'],
      ['list', 'list', 'Bulleted list'],
      ['check', 'list-checks', 'Checklist'],
      ['code', 'code', 'Code block'],
      ['link', 'link', 'Insert link'],
    ]
      .map(
        ([format, icon, label]) =>
          `<button class="ibtn" data-a="formatKnowledge" data-format="${format}" aria-label="${label}" title="${label}" ${disabled}>${ic(icon, 15)}</button>`,
      )
      .join(
        '',
      )}<span class="sp"></span><button class="btn btn-ghost btn-sm" data-a="toggleKnowledgeEditorPreview" aria-pressed="${!!S.ui.knowledgeEditorPreview}">Preview</button></div>
    <div class="knowledge-writing${S.ui.knowledgeEditorPreview ? ' with-preview' : ''}"><div class="field knowledge-body-field"><label class="sr" for="knowledge-body">Content</label><textarea class="textarea knowledge-body" id="knowledge-body" data-in="knowledgeField" data-id="${note.id}" data-field="formatted_markdown" placeholder="Write the note in Markdown. Use [[Note name]] to link related material." ${disabled}>${esc(note.formatted_markdown || '')}</textarea></div>${S.ui.knowledgeEditorPreview ? `<div class="knowledge-quick-content knowledge-live-preview" translate="no">${renderKnowledgeMarkdown(note.formatted_markdown)}</div>` : ''}</div><span class="hint">Markdown and [[wiki links]] are stored as plain text and remain portable.</span>
    ${relationsPanel(`note:${note.id}`)}${knowledgeHistory(note, readOnly || conflict)}
  </section>`;
}

const noteTime = value => {
  const parsed = typeof value === 'number' ? value : Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : Date.now();
};
