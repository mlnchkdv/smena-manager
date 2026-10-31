import { toast } from './toast.js';
import { A, IN } from '../actions/actions.js';
import { D, S, save } from '../core/store.js';
import { esc } from '../core/utils.js';
import { markdownBlocks, editBlockRange, moveMarkdownBlock } from '../shared/knowledge-blocks.js';
import { renderKnowledgeMarkdown } from '../shared/knowledge-markdown.js';
import { kc } from './knowledge-types.js';
import { knowledgeEditBlocked, updateKnowledgeSaveStatus } from './knowledge-save-status.js';
import { openModal, closeModal } from '../overlays/modals.js';
import { render } from '../shell/render.js';
const noteFor = id => D().knowledgeNotes.find(n => n.id === id);
const editable = () => S.ui.currentUser?.role !== 'viewer' && !knowledgeEditBlocked();
function update(note, body) {
  if (!editable() || !note) return;
  note.formatted_markdown = body;
  note.updatedAt = new Date().toISOString();
  note.updatedBy = D().me;
  S.ui.knowledgeDirty = true;
  save();
  updateKnowledgeSaveStatus();
}
export function blockEditor(note, disabled) {
  const active = S.ui.knowledgeBlockIndex;
  const selected = markdownBlocks(note.formatted_markdown)[active];
  S.ui.knowledgeBlockDraft = selected ? { id: note.id, index: active, base: note.formatted_markdown, start: selected.start, end: selected.end } : null;
  return `<div class="knowledge-block-editor" translate="no">${markdownBlocks(note.formatted_markdown)
    .map((block, index) =>
      block.metadata
        ? `<details><summary>${kc('Import metadata (edit in Markdown)', 'Метаданные импорта (правка в Markdown)')}</summary><pre>${esc(block.raw)}</pre></details>`
        : `<section class="knowledge-editable-block" data-block="${index}"><div class="row"><button class="btn btn-ghost btn-sm" data-a="editKnowledgeBlock" data-index="${index}">${kc('Edit block', 'Изменить блок')}</button><span class="sp"></span>${[-1, 1].map(dir => `<button class="ibtn" aria-label="${dir < 0 ? kc('Move up', 'Выше') : kc('Move down', 'Ниже')}" data-a="moveKnowledgeBlock" data-id="${esc(note.id)}" data-index="${index}" data-direction="${dir}" ${disabled}>${dir < 0 ? '↑' : '↓'}</button>`).join('')}</div>${active === index ? `<textarea class="textarea" rows="${Math.min(12, Math.max(3, block.raw.split('\n').length))}" data-in="knowledgeBlockText" data-id="${esc(note.id)}" data-index="${index}" ${disabled}>${esc(block.raw)}</textarea>` : `<div class="knowledge-quick-content">${renderKnowledgeMarkdown(block.raw)}</div>`}</section>`,
    )
    .join(
      '',
    )}<button class="btn btn-secondary" data-a="knowledgeBlockMenu" data-id="${esc(note.id)}" ${disabled}>/ ${kc('Add block', 'Добавить блок')}</button><p class="hint">${kc('Markdown is the source. Blocks preserve unsupported syntax and import metadata.', 'Markdown остаётся источником. Блоки сохраняют сложный синтаксис и метаданные импорта.')}</p></div>`;
}
A.editKnowledgeBlock = el => {
  S.ui.knowledgeBlockIndex = Number(el.dataset.index);
  render();
  requestAnimationFrame(() => document.querySelector('.knowledge-editable-block textarea')?.focus());
};
IN.knowledgeBlockText = el => {
  const note = noteFor(el.dataset.id);
  const draft = S.ui.knowledgeBlockDraft;
  if (!note || !draft || draft.id !== note.id || draft.index !== Number(el.dataset.index) || !editable()) return;
  try {
    const result = editBlockRange(note.formatted_markdown, draft, el.value);
    update(note, result.text);
    S.ui.knowledgeBlockDraft = result.range;
  } catch {
    toast(kc('The note changed. Reopen this block before editing.', 'Заметка изменилась. Откройте блок заново перед правкой.'), { kind: 'err' });
  }
};
A.moveKnowledgeBlock = el => {
  const note = noteFor(el.dataset.id);
  if (!editable() || !note) return;
  update(note, moveMarkdownBlock(note.formatted_markdown, Number(el.dataset.index), Number(el.dataset.direction)));
  S.ui.knowledgeBlockIndex = null;
  render();
};
const kinds = () => [
  ['paragraph', kc('Paragraph', 'Абзац'), ''],
  ['heading', kc('Heading', 'Заголовок'), '## '],
  ['list', kc('List', 'Список'), '- '],
  ['check', kc('Checklist', 'Чек-лист'), '- [ ] '],
  ['quote', kc('Quote', 'Цитата'), '> '],
  ['code', kc('Code', 'Код'), '```\n\n```'],
];
A.knowledgeBlockMenu = el => {
  if (!editable()) return;
  const id = el.dataset.id;
  openModal({
    type: 'knowledgeTool',
    noteId: id,
    render: (m, H) =>
      `${H(kc('Add block', 'Добавить блок'))}<div class="modal-b" translate="no">${kinds()
        .map(([kind, label]) => `<button class="btn btn-ghost" data-a="insertKnowledgeBlock" data-kind="${kind}">${label}</button>`)
        .join('')}</div>`,
  });
};
A.insertKnowledgeBlock = el => {
  const m = S.ui.modals.at(-1),
    note = noteFor(m?.noteId),
    kind = kinds().find(k => k[0] === el.dataset.kind);
  if (!note || !kind || !editable()) return;
  update(note, `${note.formatted_markdown.trimEnd()}\n\n${kind[2]}${kc('Text', 'Текст')}\n`);
  S.ui.knowledgeBlockIndex = markdownBlocks(note.formatted_markdown).length - 1;
  closeModal();
};
document.addEventListener('keydown', event => {
  const input = event.target;
  if (event.key === '/' && input.dataset?.in === 'knowledgeBlockText' && !input.value.trim()) {
    event.preventDefault();
    A.knowledgeBlockMenu({ dataset: { id: input.dataset.id } });
  }
});
