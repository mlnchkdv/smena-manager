import { blockEditor } from './knowledge-block-editor.js';
import { sourceOutline } from './knowledge-source-outline.js';
import '../features/knowledge-capture.js';
import { knowledgeContext } from './knowledge-context.js';
import '../features/knowledge-inline.js';
import { kc } from './knowledge-types.js';
import { ago, esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { D, mem } from '../core/store.js';
import { knowledgeSaveLabel, knowledgeEditBlocked } from './knowledge-save-status.js';
import { S } from '../core/store.js';
import { knowledgeHistory } from './knowledge-history.js';
import { knowledgeLivePreview } from './knowledge-live-preview.js';
import { A } from '../actions/actions.js';
import { render } from '../shell/render.js';
import { captureKnowledgeEditorPosition, restoreKnowledgeEditorPosition } from './knowledge-editor-position.js';
import { knowledgeVersionFits } from '../shared/knowledge-history.js';
import { noteTypeBadge } from './knowledge-types.js';
import { readLayoutPreference, writeLayoutPreference } from '../core/view-layout-preferences.js';
import { openModal } from '../overlays/modals.js';
export function noteUtilities(note) {
  return `<button class="btn btn-ghost" data-a="viewKnowledgeHistory" data-id="${esc(note.id)}">${ic('history', 15)}<span>Version history</span></button><button class="btn btn-ghost" data-a="downloadKnowledgeNoteSource" data-id="${esc(note.id)}">${ic('download', 15)}<span>Download source</span></button>`;
}
A.viewKnowledgeHistory = el => {
  const id = el.dataset.id;
  if (!D().knowledgeNotes.some(n => n.id === id)) return;
  openModal({
    type: 'knowledgeTool',
    render: (_m, H) => {
      const note = D().knowledgeNotes.find(n => n.id === id);
      return `${H(kc('Version history', 'История версий'))}<div class="modal-b">${note ? knowledgeHistory(note, S.ui.currentUser?.role === 'viewer' || knowledgeEditBlocked(), true) : '<p>Material unavailable</p>'}</div>`;
    },
  });
};

A.downloadKnowledgeNoteSource = el => {
  const note = D().knowledgeNotes.find(note => note.id === el.dataset.id);
  if (!note || typeof note.formatted_markdown !== 'string') return;
  const url = URL.createObjectURL(new Blob([note.formatted_markdown], { type: 'text/plain;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = (note.title || 'note').replace(/[\\/:*?"<>|\p{Cc}]/gu, '-').slice(0, 120) + (note.sourceFormat === 'text' ? '.txt' : '.md');
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
};

A.toggleKnowledgeLineWrap = () => {
  captureKnowledgeEditorPosition();
  writeLayoutPreference('knowledge-line-wrap', !readLayoutPreference('knowledge-line-wrap', true));
  render();
  restoreKnowledgeEditorPosition(S.ui.knowledgeEditorPane || 'source');
};
A.toggleKnowledgeFormatting = () => {
  captureKnowledgeEditorPosition();
  S.ui.knowledgeFormatExpanded = !S.ui.knowledgeFormatExpanded;
  render();
  restoreKnowledgeEditorPosition(S.ui.knowledgeEditorPane || 'source');
};
A.toggleKnowledgeEditorFocus = () => {
  captureKnowledgeEditorPosition();
  S.ui.knowledgeEditorFocus = !S.ui.knowledgeEditorFocus;
  render();
  restoreKnowledgeEditorPosition(S.ui.knowledgeEditorPane || 'source');
};

export function noteEditor(note, folders, readOnly) {
  const context = JSON.stringify([S.ui.currentUser?.id, D().ws.id || D().ws.url, note.id]);
  if (S.ui.knowledgeEditorContext !== context) {
    S.ui.knowledgeEditorContext = context;
    S.ui.knowledgeEditorPane = 'source';
    S.ui.knowledgeFormatExpanded = false;
    S.ui.knowledgeEditorFocus = false;
  }
  const pane = S.ui.knowledgeEditorPane === 'blocks' && note.sourceFormat !== 'text' ? 'blocks' : S.ui.knowledgeEditorPane === 'preview' ? 'preview' : 'source';
  const showPreview = S.ui.knowledgeEditorPreview || pane === 'preview';
  const conflict = knowledgeEditBlocked();
  const disabled = readOnly || conflict ? 'disabled' : '';
  return `<section class="knowledge-editor${S.ui.knowledgeFormatExpanded ? ' formatting-expanded' : ''}${S.ui.knowledgeEditorFocus ? ' is-focused' : ''}" data-pane="${pane}" aria-label="Note editor">
    <div class="knowledge-editor-head">
      <div class="knowledge-heading-title">
        <label class="sr" for="knowledge-title">Note title</label>
        <textarea rows="1" class="knowledge-title" id="knowledge-title" data-in="knowledgeField" data-blur="knowledgeField" data-id="${note.id}" data-field="title" placeholder="Untitled note" ${disabled}>${esc(note.title)}</textarea>
      </div>
      <div class="knowledge-editor-meta-row"><div class="knowledge-meta">${noteTypeBadge(note)}${ic('clock-3', 12)}<span>Updated ${ago(noteTime(note.updatedAt))}</span>${note.updatedBy && mem(note.updatedBy) ? `<span translate="no">· ${esc(mem(note.updatedBy).name)}</span>` : ''}<span class="knowledge-save-status knowledge-wide-save" aria-hidden="true" data-knowledge-save-status>${knowledgeSaveLabel()}</span></div>${readOnly ? `<span class="badge">${ic('eye', 12)}View only</span>` : `<details class="ui-menu knowledge-note-actions"><summary class="ibtn" aria-label="More actions">${ic('ellipsis', 16)}</summary><div>${noteUtilities(note)}${note.captureStatus === 'unprocessed' ? `<button class="btn btn-ghost" data-a="finishKnowledgeCapture" data-id="${esc(note.id)}" translate="no">${kc('Finish processing', 'Завершить разбор')}</button>` : ''}<button class="btn btn-ghost" data-a="keepKnowledgeOffline" data-id="${esc(note.id)}" translate="no">${kc('Keep offline', 'Сохранить офлайн')}</button><button class="btn btn-ghost" data-a="showKnowledgeProperties">Note properties</button><button class="btn btn-danger-ghost" data-a="deleteKnowledgeNote" data-id="${note.id}">${ic('trash-2', 13)}Delete</button></div></details>`}</div>
    </div>
    <span class="sr" role="status" aria-live="polite" data-knowledge-save-status>${knowledgeSaveLabel()}</span>
    ${conflict ? `<div class="alert danger" role="alert"><span>Resolve the saved conflict before editing this note.</span><button class="btn btn-secondary btn-sm" data-a="reviewSyncConflict">Review conflict</button><button class="btn btn-ghost btn-sm" data-a="downloadUnsyncedCopy">Export recovery copy</button></div>` : ''}
    <div class="alert info knowledge-version-coverage" data-knowledge-version-coverage data-id="${esc(note.id)}" role="status" ${knowledgeVersionFits(note) ? 'hidden' : ''}><span>Large note: text can be saved, but new individual versions are not created. Download the source before major edits.</span><button class="btn btn-secondary btn-sm" data-a="downloadKnowledgeNoteSource" data-id="${esc(note.id)}">Download source</button></div>

    <div class="knowledge-editor-mode"><div class="seg" role="group" aria-label="Note view"><button id="knowledge-pane-source" data-a="setKnowledgeEditorPane" data-pane="source" aria-pressed="${pane === 'source'}" class="${pane === 'source' ? 'on' : ''}">Editor</button>${note.sourceFormat !== 'text' ? `<button data-a="setKnowledgeEditorPane" data-pane="blocks" aria-pressed="${pane === 'blocks'}" class="${pane === 'blocks' ? 'on' : ''}" translate="no">${kc('Blocks', 'Блоки')}</button>` : ''}<button id="knowledge-pane-preview" data-a="setKnowledgeEditorPane" data-pane="preview" aria-pressed="${pane === 'preview'}" class="${pane === 'preview' ? 'on' : ''}" translate="no">${kc('Read', 'Читать')}</button></div><span class="knowledge-save-status" aria-hidden="true" data-knowledge-save-status>${knowledgeSaveLabel()}</span>${pane === 'source' ? sourceOutline(note) : ''}<button class="ibtn knowledge-line-wrap" data-a="toggleKnowledgeLineWrap" aria-label="${kc('Wrap lines', 'Перенос строк')}" title="${kc('Wrap lines', 'Перенос строк')}" aria-pressed="${readLayoutPreference('knowledge-line-wrap', true)}">${ic('wrap-text', 16)}</button><button class="ibtn knowledge-format-toggle" data-a="toggleKnowledgeFormatting" aria-label="Text formatting" aria-expanded="${!!S.ui.knowledgeFormatExpanded}" aria-controls="knowledge-format-tools">${ic('type', 16)}</button><button class="ibtn knowledge-editor-focus" data-a="toggleKnowledgeEditorFocus" aria-pressed="${!!S.ui.knowledgeEditorFocus}" aria-label="${kc(S.ui.knowledgeEditorFocus ? 'Exit editor focus' : 'Focus editor', S.ui.knowledgeEditorFocus ? 'Выйти из фокуса редактора' : 'Фокус на редакторе')}" title="${kc(S.ui.knowledgeEditorFocus ? 'Exit editor focus' : 'Focus editor', S.ui.knowledgeEditorFocus ? 'Выйти из фокуса редактора' : 'Фокус на редакторе')}">${ic(S.ui.knowledgeEditorFocus ? 'minimize' : 'maximize', 16)}</button></div>
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
      )}<button class="ibtn" data-a="attachKnowledgeMedia" aria-label="${kc('Insert file or image', 'Вставить файл или изображение')}" ${disabled}>${ic('paperclip', 15)}</button><button class="ibtn" data-a="insertKnowledgeMaterial" aria-label="${kc('Link material', 'Связать материал')}" title="[[" ${disabled}>${ic('at-sign', 15)}</button><span class="sp"></span><button class="btn btn-ghost btn-sm knowledge-desktop-preview" data-a="toggleKnowledgeEditorPreview" aria-pressed="${!!showPreview}">Preview alongside</button></div>
    ${pane === 'blocks' ? blockEditor(note, disabled) : ''}<div ${pane === 'blocks' ? 'hidden' : ''} class="knowledge-writing${showPreview ? ' with-preview' : ''}"><div class="field knowledge-body-field"><label class="sr" for="knowledge-body">Content</label><textarea class="textarea knowledge-body" id="knowledge-body" wrap="${readLayoutPreference('knowledge-line-wrap', true) ? 'soft' : 'off'}" data-keep="knowledge-source:${note.id}" data-in="knowledgeField" data-id="${note.id}" data-field="formatted_markdown" placeholder="Write the note in Markdown. Use [[Note name]] to link related material." ${disabled}>${esc(note.formatted_markdown || '')}</textarea></div>${showPreview ? `<div class="knowledge-live-preview">${knowledgeLivePreview(note)}</div>` : ''}</div><span class="hint">Markdown and [[wiki links]] are stored as plain text and remain portable.</span>
    <button class="btn btn-ghost" data-a="openNoteProperties" data-id="${esc(note.id)}">${ic('sliders-horizontal', 15)}Note properties</button>
    ${knowledgeContext(note)}${knowledgeHistory(note, readOnly || conflict)}
  </section>`;
}

const noteTime = value => {
  const parsed = typeof value === 'number' ? value : Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : Date.now();
};
