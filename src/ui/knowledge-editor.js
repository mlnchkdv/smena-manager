import { noteAliases } from './knowledge-tags.js';
import { knowledgeContext } from './knowledge-context.js';
import '../features/knowledge-inline.js';
import { noteTypeFields, kc } from './knowledge-types.js';
import { ago, esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { D, mem } from '../core/store.js';
import { knowledgeSaveLabel, knowledgeEditBlocked } from './knowledge-save-status.js';
import { S } from '../core/store.js';
import { knowledgeHistory } from './knowledge-history.js';
import { folderTrail } from '../shared/knowledge-tools.js';
import { knowledgeDisclosure } from './knowledge-disclosure.js';
import { knowledgeLivePreview } from './knowledge-live-preview.js';
import { KNOWLEDGE_CATEGORIES, knowledgeCategoryLabel } from './knowledge-category.js';
import { A } from '../actions/actions.js';
import { render } from '../shell/render.js';
import { captureKnowledgeEditorPosition, restoreKnowledgeEditorPosition } from './knowledge-editor-position.js';

A.toggleKnowledgeFormatting = () => {
  captureKnowledgeEditorPosition();
  S.ui.knowledgeFormatExpanded = !S.ui.knowledgeFormatExpanded;
  render();
  restoreKnowledgeEditorPosition(S.ui.knowledgeEditorPane || 'source');
};

export function noteEditor(note, folders, readOnly) {
  const context = JSON.stringify([S.ui.currentUser?.id, D().ws.id || D().ws.url, note.id]);
  if (S.ui.knowledgeEditorContext !== context) {
    S.ui.knowledgeEditorContext = context;
    S.ui.knowledgeEditorPane = 'source';
    S.ui.knowledgeFormatExpanded = false;
  }
  const pane = S.ui.knowledgeEditorPane === 'preview' ? 'preview' : 'source';
  const showPreview = S.ui.knowledgeEditorPreview || pane === 'preview';
  const conflict = knowledgeEditBlocked();
  const disabled = readOnly || conflict ? 'disabled' : '';
  const categories = [...new Set([...KNOWLEDGE_CATEGORIES, note.category].filter(Boolean))];
  const folderIndex = new Map(folders.map(folder => [folder.id, folder]));
  return `<section class="knowledge-editor${S.ui.knowledgeFormatExpanded ? ' formatting-expanded' : ''}" data-pane="${pane}" aria-label="Note editor">
    <div class="knowledge-editor-head">
      <div class="knowledge-heading-title">
        <label class="sr" for="knowledge-title">Note title</label>
        <textarea rows="1" class="knowledge-title" id="knowledge-title" data-in="knowledgeField" data-blur="knowledgeField" data-id="${note.id}" data-field="title" placeholder="Untitled note" ${disabled}>${esc(note.title)}</textarea>
      </div>
      <div class="knowledge-editor-meta-row"><div class="knowledge-meta">${ic('clock-3', 12)}<span>Updated ${ago(noteTime(note.updatedAt))}</span>${note.updatedBy && mem(note.updatedBy) ? `<span translate="no">· ${esc(mem(note.updatedBy).name)}</span>` : ''}<span class="knowledge-save-status knowledge-wide-save" aria-hidden="true" data-knowledge-save-status>${knowledgeSaveLabel()}</span></div>${readOnly ? `<span class="badge">${ic('eye', 12)}View only</span>` : `<details class="ui-menu knowledge-note-actions"><summary class="ibtn" aria-label="More actions">${ic('ellipsis', 16)}</summary><div><button class="btn btn-ghost" data-a="showKnowledgeProperties">Note properties</button><button class="btn btn-danger-ghost" data-a="deleteKnowledgeNote" data-id="${note.id}">${ic('trash-2', 13)}Delete</button></div></details>`}</div>
    </div>
    <span class="sr" role="status" aria-live="polite" data-knowledge-save-status>${knowledgeSaveLabel()}</span>
    ${conflict ? `<div class="alert danger" role="alert"><span>Resolve the saved conflict before editing this note.</span><button class="btn btn-secondary btn-sm" data-a="reviewSyncConflict">Review conflict</button><button class="btn btn-ghost btn-sm" data-a="downloadUnsyncedCopy">Export recovery copy</button></div>` : ''}

    ${noteTypeFields(note, readOnly)}
    <div class="knowledge-editor-mode"><div class="seg" role="group" aria-label="Note view"><button id="knowledge-pane-source" data-a="setKnowledgeEditorPane" data-pane="source" aria-pressed="${pane === 'source'}" class="${pane === 'source' ? 'on' : ''}">Editor</button><button id="knowledge-pane-preview" data-a="setKnowledgeEditorPane" data-pane="preview" aria-pressed="${pane === 'preview'}" class="${pane === 'preview' ? 'on' : ''}">Preview</button></div><span class="knowledge-save-status" aria-hidden="true" data-knowledge-save-status>${knowledgeSaveLabel()}</span><button class="ibtn knowledge-format-toggle" data-a="toggleKnowledgeFormatting" aria-label="Text formatting" aria-expanded="${!!S.ui.knowledgeFormatExpanded}" aria-controls="knowledge-format-tools">${ic('type', 16)}</button></div>
    <div id="knowledge-format-tools" class="knowledge-format-toolbar" role="group" aria-label="Text formatting" title="Ctrl/⌘ B · Bold / Ctrl/⌘ Enter · Preview / Ctrl/⌘ S · Save">${[
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
      )}<button class="ibtn" data-a="insertKnowledgeMaterial" aria-label="${kc('Link material', 'Связать материал')}" title="[[" ${disabled}>${ic('at-sign', 15)}</button><span class="sp"></span><button class="btn btn-ghost btn-sm knowledge-desktop-preview" data-a="toggleKnowledgeEditorPreview" aria-pressed="${!!showPreview}">Preview</button></div>
    <div class="knowledge-writing${showPreview ? ' with-preview' : ''}"><div class="field knowledge-body-field"><label class="sr" for="knowledge-body">Content</label><textarea class="textarea knowledge-body" id="knowledge-body" data-keep="knowledge-source:${note.id}" data-in="knowledgeField" data-id="${note.id}" data-field="formatted_markdown" placeholder="Write the note in Markdown. Use [[Note name]] to link related material." ${disabled}>${esc(note.formatted_markdown || '')}</textarea></div>${showPreview ? `<div class="knowledge-live-preview">${knowledgeLivePreview(note)}</div>` : ''}</div><span class="hint">Markdown and [[wiki links]] are stored as plain text and remain portable.</span>
    <details class="knowledge-properties" ${knowledgeDisclosure(note.id, 'properties')}><summary>Note properties</summary><div class="knowledge-properties-body"><div class="knowledge-fields">
      <div class="field"><label class="label" for="knowledge-category">Category</label><select class="select" id="knowledge-category" data-in="knowledgeField" data-id="${note.id}" data-field="category" ${disabled}>${categories.map(value => `<option value="${esc(value)}" ${note.category === value ? 'selected' : ''} translate="no">${esc(knowledgeCategoryLabel(value))}</option>`).join('')}</select></div>
      <div class="field"><label class="label" for="knowledge-folder">Folder</label><select class="select" id="knowledge-folder" data-in="knowledgeField" data-id="${note.id}" data-field="folderId" ${disabled}><option value="">No folder</option>${folders
        .map(
          folder =>
            `<option value="${folder.id}" ${note.folderId === folder.id ? 'selected' : ''} translate="no">${esc(
              folderTrail(folder.id, folderIndex)
                .map(item => item.name)
                .join(' / '),
            )}</option>`,
        )
        .join('')}</select></div>
    </div>
    ${noteAliases(note, disabled)}<div class="knowledge-fields knowledge-fields-secondary"><div class="field"><label class="label" for="knowledge-summary">Summary</label><input class="input" id="knowledge-summary" value="${esc(note.summary || '')}" data-in="knowledgeField" data-blur="knowledgeField" data-id="${note.id}" data-field="summary" placeholder="A short description of the note" ${disabled}></div>
    <div class="field"><label class="label" for="knowledge-tags">Tags</label><input class="input" id="knowledge-tags" value="${esc((note.tags || []).join(', '))}" data-in="knowledgeField" data-blur="knowledgeField" data-id="${note.id}" data-field="tags" placeholder="process, onboarding, team" ${disabled}><span class="hint">Separate tags with commas.</span></div></div>
    </div></details>
    ${knowledgeContext(note)}${knowledgeHistory(note, readOnly || conflict)}
  </section>`;
}

const noteTime = value => {
  const parsed = typeof value === 'number' ? value : Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : Date.now();
};
