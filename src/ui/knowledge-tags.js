import { A, IN } from '../actions/actions.js';
import { D, S, save } from '../core/store.js';
import { esc } from '../core/utils.js';
import { kc } from './knowledge-types.js';
import { openModal, closeModal } from '../overlays/modals.js';
import { mutate } from './toast.js';
import { renameKnowledgeTag, validAliases } from '../shared/knowledge-tags.js';
import { knowledgeEditBlocked, updateKnowledgeSaveStatus } from './knowledge-save-status.js';
import { render } from '../shell/render.js';
export function noteAliases(note, disabled) {
  return `<label class="field" translate="no"><span class="label">${kc('Aliases (comma-separated)', 'Псевдонимы (через запятую)')}</span><input class="input" data-in="noteAliases" data-id="${esc(note.id)}" value="${esc((note.aliases || []).join(', '))}" maxlength="2000" ${disabled}></label>`;
}
IN.noteAliases = el => {
  if (S.ui.currentUser?.role === 'viewer' || knowledgeEditBlocked()) return;
  const aliases = [
    ...new Set(
      el.value
        .split(',')
        .map(s => s.trim())
        .filter(Boolean),
    ),
  ];
  if (!validAliases(aliases)) return;
  const note = D().knowledgeNotes.find(n => n.id === el.dataset.id);
  if (!note) return;
  note.aliases = aliases;
  note.updatedAt = new Date().toISOString();
  note.updatedBy = D().me;
  S.ui.knowledgeDirty = true;
  save();
  updateKnowledgeSaveStatus();
};
function form(m, H) {
  const tags = [...new Set(D().knowledgeNotes.flatMap(n => n.tags || []))].sort((a, b) => a.localeCompare(b));
  return `${H(kc('Knowledge tags', 'Теги базы знаний'))}<div class="modal-b" translate="no"><p class="hint">${kc('Rename or merge a tag across knowledge notes. Old names remain searchable.', 'Переименование или объединение тега во всех заметках. Старые названия остаются в поиске.')}</p><label class="field">${kc('Tag', 'Тег')}<select class="select" data-in="knowledgeTagDraft" data-field="from">${tags.map(tag => `<option value="${esc(tag)}" ${m.from === tag ? 'selected' : ''}>${esc(tag)}</option>`).join('')}</select></label><label class="field">${kc('New or existing name', 'Новое или существующее название')}<input class="input" maxlength="80" data-in="knowledgeTagDraft" data-field="to" value="${esc(m.to)}"></label>${m.error ? `<p class="err">${esc(m.error)}</p>` : ''}</div><div class="modal-f" translate="no"><button class="btn btn-secondary" data-a="closeModal">${kc('Cancel', 'Отмена')}</button><button class="btn btn-primary" data-a="renameKnowledgeTag" ${!tags.length ? 'disabled' : ''}>${kc('Rename / merge', 'Переименовать / объединить')}</button></div>`;
}
A.manageKnowledgeTags = () => {
  if (S.ui.currentUser?.role === 'viewer' || knowledgeEditBlocked()) return;
  openModal({ type: 'knowledgeTool', render: form, from: D().knowledgeNotes.flatMap(n => n.tags || [])[0] || '', to: '' });
};
IN.knowledgeTagDraft = el => {
  S.ui.modals.at(-1)[el.dataset.field] = el.value;
};
A.renameKnowledgeTag = () => {
  if (S.ui.currentUser?.role === 'viewer' || knowledgeEditBlocked()) return;
  const m = S.ui.modals.at(-1);
  try {
    const notes = renameKnowledgeTag(D().knowledgeNotes, m.from, m.to);
    if (
      mutate(() => {
        D().knowledgeNotes = notes.map((n, i) => (n === D().knowledgeNotes[i] ? n : { ...n, updatedAt: new Date().toISOString(), updatedBy: D().me }));
      })
    )
      closeModal();
  } catch {
    m.error = kc('Enter a tag name (up to 80 characters).', 'Укажите тег до 80 символов.');
    render();
  }
};
