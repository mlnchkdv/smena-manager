import { knowledgeDisclosure } from './knowledge-disclosure.js';
import { updateKnowledgeSaveStatus } from './knowledge-save-status.js';
import { A, IN } from '../actions/actions.js';
import { D, S, save, visibleProjects } from '../core/store.js';
import { esc, uid } from '../core/utils.js';
import { isRussian } from '../core/i18n.js';
import { mutate } from './toast.js';
import { knowledgeEditBlocked } from './knowledge-save-status.js';
import { openModal, closeModal } from '../overlays/modals.js';
import { render } from '../shell/render.js';
import { noteType, noteTypes, PROPERTY_KINDS, validNoteTypes } from '../shared/knowledge-types.js';
export const kc = (en, ru) => (isRussian() ? ru : en);
export const typeName = type => (isRussian() && type.ru ? type.ru : type.name);
const kinds = {
  text: ['Text', 'Текст'],
  number: ['Number', 'Число'],
  date: ['Date', 'Дата'],
  checkbox: ['Checkbox', 'Флажок'],
  member: ['Member', 'Участник'],
  project: ['Project', 'Проект'],
};
export function noteTypeFields(note, readOnly = false) {
  const type = noteType(note, D().ws),
    values = note.properties || {},
    disabled = readOnly || knowledgeEditBlocked();
  return `<details class="knowledge-type-fields" ${knowledgeDisclosure(note.id, 'typed')} translate="no"><summary>${kc('Type and properties', 'Тип и свойства')}: ${esc(typeName(type))}</summary><label class="field"><span class="label">${kc('Note type', 'Тип заметки')}</span><select class="select" data-in="noteType" data-id="${esc(note.id)}" ${disabled ? 'disabled' : ''}>${noteTypes(
    D().ws,
  )
    .map(item => `<option value="${esc(item.id)}" ${type.id === item.id ? 'selected' : ''}>${esc(typeName(item))}</option>`)
    .join(
      '',
    )}</select></label>${S.ui.currentUser?.role === 'admin' ? `<button class="btn btn-ghost btn-sm" data-a="manageNoteTypes">${kc('Manage types', 'Настроить типы')}</button>` : ''}<div class="knowledge-fields">${type.fields
    .map(field => {
      const attrs = `data-in="noteProperty" data-id="${esc(note.id)}" data-field="${esc(field.id)}" ${disabled ? 'disabled' : ''}`,
        value = values[field.id] ?? '';
      const options =
        field.kind === 'member'
          ? D().members.filter(member => !['removed', 'deactivated'].includes(member.status))
          : field.kind === 'project'
            ? visibleProjects()
            : null;
      const input = options
        ? `<select class="select" ${attrs}><option value="">—</option>${options.map(item => `<option value="${esc(item.id)}" ${value === item.id ? 'selected' : ''}>${esc(item.name)}</option>`).join('')}</select>`
        : `<input class="${field.kind === 'checkbox' ? 'knowledge-checkbox' : 'input'}" type="${field.kind === 'checkbox' ? 'checkbox' : field.kind === 'number' ? 'number' : field.kind === 'date' ? 'date' : 'text'}" ${attrs} ${field.kind === 'checkbox' ? (value === true ? 'checked' : '') : `value="${esc(value)}" maxlength="2000"`}>`;
      return `<label class="field"><span class="label">${esc(typeName(field))}</span>${input}</label>`;
    })
    .join('')}</div></details>`;
}
const editable = () => S.ui.currentUser?.role !== 'viewer' && !knowledgeEditBlocked();
const stamp = note => {
  note.updatedAt = new Date().toISOString();
  note.updatedBy = D().me;
};
IN.noteType = el => {
  if (!editable()) return;
  const note = D().knowledgeNotes.find(item => item.id === el.dataset.id);
  if (note && noteTypes(D().ws).some(type => type.id === el.value))
    mutate(() => {
      note.typeId = el.value;
      stamp(note);
    });
  render();
};
IN.noteProperty = el => {
  if (!editable()) return;
  const note = D().knowledgeNotes.find(item => item.id === el.dataset.id),
    field = note && noteType(note, D().ws).fields.find(item => item.id === el.dataset.field);
  if (!field) return;
  const value = field.kind === 'checkbox' ? el.checked : field.kind === 'number' && el.value !== '' ? Number(el.value) : el.value;
  if (typeof value === 'number' && !Number.isFinite(value)) return;
  note.properties = { ...note.properties, [field.id]: value };
  stamp(note);
  S.ui.knowledgeDirty = true;
  save();
  updateKnowledgeSaveStatus();
};
function typeForm(m, H) {
  return `${H(kc('Note types', 'Типы заметок'))}<div class="modal-b" translate="no"><label class="field">${kc('Custom type', 'Настраиваемый тип')}<select class="select" data-in="chooseNoteType"><option value="">${kc('New type', 'Новый тип')}</option>${(D().ws.knowledgeTypes || []).map(type => `<option value="${esc(type.id)}" ${m.item.id === type.id ? 'selected' : ''}>${esc(type.name)}</option>`).join('')}</select></label><label class="field">${kc('Name', 'Название')}<input class="input" maxlength="80" data-in="typeDraft" data-field="name" value="${esc(m.item.name)}"></label>${m.item.fields.map((field, index) => `<div class="knowledge-type-definition"><input class="input" aria-label="${kc('Field name', 'Название поля')}" data-in="typeDraft" data-index="${index}" data-field="name" value="${esc(field.name)}" maxlength="80"><select class="select" aria-label="${kc('Field type', 'Тип поля')}" data-in="typeDraft" data-index="${index}" data-field="kind">${PROPERTY_KINDS.map(kind => `<option ${field.kind === kind ? 'selected' : ''} value="${kind}">${kc(...kinds[kind])}</option>`).join('')}</select></div>`).join('')}<button class="btn btn-secondary" data-a="addNoteTypeField" ${m.item.fields.length >= 20 ? 'disabled' : ''}>${kc('Add field', 'Добавить поле')}</button>${m.error ? `<p role="alert" class="err">${esc(m.error)}</p>` : ''}<p class="hint">${kc('Existing values are retained when you change a note type.', 'При смене типа заметки существующие значения сохраняются.')}</p></div><div class="modal-f"><button class="btn btn-secondary" data-a="closeModal">${kc('Cancel', 'Отмена')}</button><button class="btn btn-primary" data-a="saveNoteType">${kc('Save', 'Сохранить')}</button></div>`;
}
A.manageNoteTypes = () => {
  if (S.ui.currentUser?.role !== 'admin' || knowledgeEditBlocked()) return;
  openModal({ type: 'knowledgeTool', item: { id: uid('type'), name: '', fields: [] }, render: typeForm });
};
IN.chooseNoteType = el => {
  const m = S.ui.modals.at(-1);
  m.item = structuredClone(D().ws.knowledgeTypes?.find(type => type.id === el.value) || { id: uid('type'), name: '', fields: [] });
  render();
};
IN.typeDraft = el => {
  const m = S.ui.modals.at(-1);
  if (m?.type !== 'knowledgeTool') return;
  (el.dataset.index == null ? m.item : m.item.fields[Number(el.dataset.index)])[el.dataset.field] = el.value;
};
A.addNoteTypeField = () => {
  const m = S.ui.modals.at(-1);
  if (m?.item?.fields.length < 20) {
    m.item.fields.push({ id: uid('field'), name: '', kind: 'text' });
    render();
  }
};
A.saveNoteType = () => {
  if (S.ui.currentUser?.role !== 'admin' || knowledgeEditBlocked()) return;
  const m = S.ui.modals.at(-1);
  const types = (D().ws.knowledgeTypes || []).filter(type => type.id !== m.item.id).concat(m.item);
  if (!validNoteTypes(types)) {
    m.error = kc('Enter names for the type and every field.', 'Укажите названия типа и каждого поля.');
    return render();
  }
  if (
    mutate(() => {
      D().ws.knowledgeTypes = types;
    })
  )
    closeModal();
};
