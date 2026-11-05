import { A, IN, snapshot, restore } from '../actions/actions.js';
import { D, S, visibleProjects } from '../core/store.js';
import { getSessionGeneration } from '../core/api.js';
import { openModal, closeModal } from '../overlays/modals.js';
import { render } from '../shell/render.js';
import { mutate, toast } from '../ui/toast.js';
import { knowledgeEditBlocked } from '../ui/knowledge-save-status.js';
import { noteType, noteTypes } from '../shared/knowledge-types.js';
import { bulkNoteProperties } from '../shared/knowledge-bulk-properties.js';
import { esc } from '../core/utils.js';
import { kc, typeName } from '../ui/knowledge-types.js';
const selected = m => D().knowledgeNotes.filter(note => m.ids.includes(note.id));
const signature = m => JSON.stringify([selected(m), D().ws.knowledgeTypes]);
const current = m => m?.render === view && m.generation === getSessionGeneration() && S.ui.currentUser?.role !== 'viewer' && !knowledgeEditBlocked();
export function editKnowledgeSelection() {
  const ids = [...new Set(S.ui.knowledgeSelection || [])];
  if (!ids.length || ids.length > 500 || knowledgeEditBlocked() || S.ui.currentUser?.role === 'viewer') return;
  const m = { type: 'knowledgeTool', render: view, ids, generation: getSessionGeneration(), typeId: '', property: '', addTags: '', removeTags: '', value: '' };
  m.base = signature(m);
  openModal(m);
}
const commonFields = m => {
  const types = selected(m).map(note => noteType(m.typeId ? { typeId: m.typeId } : note, D().ws));
  return (types[0]?.fields || []).filter(field => types.every(type => type.fields.some(other => other.id === field.id && other.kind === field.kind)));
};
function valueInput(m, field) {
  const attrs = 'id="bulk-note-value" data-in="bulkNoteValue" data-key="value"';
  const options =
    field?.kind === 'member'
      ? D().members.filter(member => !['removed', 'deactivated'].includes(member.status))
      : field?.kind === 'project'
        ? visibleProjects()
        : null;
  if (options)
    return `<select class="select" ${attrs}><option value="">—</option>${options.map(item => `<option value="${esc(item.id)}" ${item.id === m.value ? 'selected' : ''}>${esc(item.name)}</option>`).join('')}</select>`;
  if (field?.kind === 'checkbox')
    return `<select class="select" ${attrs}><option value="false" ${m.value === 'false' ? 'selected' : ''}>${kc('No', 'Нет')}</option><option value="true" ${m.value === 'true' ? 'selected' : ''}>${kc('Yes', 'Да')}</option></select>`;
  return `<input class="input" ${attrs} type="${['date', 'number'].includes(field?.kind) ? field.kind : 'text'}" ${field?.kind === 'number' ? 'step="any"' : ''} value="${esc(m.value)}">`;
}
function patchSummary(m, fields) {
  const field = fields.find(field => field.id === m.property);
  const value =
    field?.kind === 'member'
      ? D().members.find(item => item.id === m.value)?.name
      : field?.kind === 'project'
        ? D().projects.find(item => item.id === m.value)?.name
        : field?.kind === 'checkbox'
          ? m.value === 'true'
            ? kc('Yes', 'Да')
            : kc('No', 'Нет')
          : m.value;
  const lines = [
    m.addTags && [kc('Add tags', 'Добавить теги'), m.addTags],
    m.removeTags && [kc('Remove tags', 'Убрать теги'), m.removeTags],
    m.typeId && [kc('Type', 'Тип'), typeName(noteTypes(D().ws).find(type => type.id === m.typeId))],
    field && [typeName(field), value || '—'],
  ].filter(Boolean);
  return `<dl>${lines.map(([name, value]) => `<dt>${esc(name)}</dt><dd>${esc(value)}</dd>`).join('')}</dl>`;
}
function view(m, H) {
  const fields = commonFields(m);
  return (
    H(kc('Edit selected notes', 'Изменить выбранные заметки')) +
    `<div class="modal-b" translate="no"><p>${kc('Selected', 'Выбрано')}: ${m.ids.length}</p>${m.error ? `<p class="err" role="alert">${esc(m.error)}</p>` : ''}${
      m.next
        ? `<p role="status">${m.changedIds.length ? kc(`Will change: ${m.changedIds.length} of ${m.ids.length} notes.`, `Изменится ${m.changedIds.length} из ${m.ids.length} заметок.`) : kc('No changes. The selected notes already have these values.', 'Нет изменений. У выбранных заметок уже указаны эти значения.')}</p><p>${kc('Only the listed properties will change. Content and other properties stay intact.', 'Изменятся только указанные свойства. Текст и остальные поля сохранятся.')}</p>${patchSummary(m, fields)}<ul>${selected(
            m,
          )
            .filter(note => m.changedIds.includes(note.id))
            .slice(0, 20)
            .map(note => `<li>${esc(note.title)}</li>`)
            .join('')}</ul>`
        : `<label class="field"><span class="label">${kc('Add tags (comma-separated)', 'Добавить теги через запятую')}</span><input class="input" id="bulk-note-add" value="${esc(m.addTags)}" data-in="bulkNoteValue" data-key="addTags"></label><label class="field"><span class="label">${kc('Remove tags', 'Убрать теги')}</span><input class="input" id="bulk-note-remove" value="${esc(m.removeTags)}" data-in="bulkNoteValue" data-key="removeTags"></label><label class="field"><span class="label">${kc('Note type', 'Тип заметки')}</span><select class="select" data-in="bulkNoteValue" data-key="typeId"><option value="">${kc('Keep current', 'Не менять')}</option>${noteTypes(
            D().ws,
          )
            .map(type => `<option value="${esc(type.id)}" ${type.id === m.typeId ? 'selected' : ''}>${esc(typeName(type))}</option>`)
            .join(
              '',
            )}</select></label><label class="field"><span class="label">${kc('Common property', 'Общее свойство')}</span><select class="select" data-in="bulkNoteValue" data-key="property"><option value="">${kc('Keep current', 'Не менять')}</option>${fields.map(field => `<option value="${esc(field.id)}" ${field.id === m.property ? 'selected' : ''}>${esc(typeName(field))}</option>`).join('')}</select></label>${
            m.property
              ? `<label class="field"><span class="label">${kc('New value', 'Новое значение')}</span>${valueInput(
                  m,
                  fields.find(field => field.id === m.property),
                )}</label>`
              : ''
          }`
    }</div><div class="modal-f"><button class="btn btn-secondary" data-a="closeModal">${kc('Cancel', 'Отмена')}</button>${m.next ? `<button class="btn btn-secondary" data-a="backBulkNotePreview">${kc('Back', 'Назад')}</button><button class="btn btn-primary" data-a="applyBulkNoteProperties" ${m.changedIds.length ? '' : 'disabled'}>${kc('Apply', 'Применить')}</button>` : `<button class="btn btn-primary" data-a="previewBulkNoteProperties">${kc('Review changes', 'Проверить изменения')}</button>`}</div>`
  );
}
IN.bulkNoteValue = el => {
  const m = S.ui.modals.at(-1);
  if (!current(m) || !['typeId', 'property', 'value', 'addTags', 'removeTags'].includes(el.dataset.key)) return;
  m[el.dataset.key] = el.value;
  if (el.dataset.key === 'typeId') m.property = '';
  if (el.dataset.key === 'property') m.value = commonFields(m).find(field => field.id === m.property)?.kind === 'checkbox' ? 'false' : '';
  if (el.tagName === 'SELECT') render();
};
A.previewBulkNoteProperties = () => {
  const m = S.ui.modals.at(-1);
  if (!current(m)) return;
  if (signature(m) !== m.base) {
    m.error = kc('The selected notes changed. Reopen this dialog.', 'Выбранные заметки изменились. Откройте окно заново.');
    render();
    return;
  }
  try {
    m.patch = Object.fromEntries(['typeId', 'property', 'value', 'addTags', 'removeTags'].map(key => [key, m[key]]));
    m.next = bulkNoteProperties(D().knowledgeNotes, m.ids, m.patch, D().ws);
    m.changedIds = m.next.filter((note, index) => m.ids.includes(note.id) && note !== D().knowledgeNotes[index]).map(note => note.id);
    m.error = '';
  } catch (error) {
    m.error =
      error.code === 'BULK_TAG_CONFLICT'
        ? kc('A tag cannot be added and removed in the same change.', 'Один тег нельзя одновременно добавить и убрать.')
        : kc('Check the tags, property type and value.', 'Проверьте теги, тип свойства и значение.');
  }
  render();
};
A.backBulkNotePreview = () => {
  const m = S.ui.modals.at(-1);
  if (current(m)) {
    m.next = null;
    render();
  }
};
A.applyBulkNoteProperties = () => {
  const m = S.ui.modals.at(-1);
  if (!current(m) || !m.next || !m.changedIds?.length) return;
  if (signature(m) !== m.base) {
    m.error = kc('The selected notes changed. Reopen this dialog.', 'Выбранные заметки изменились. Откройте окно заново.');
    render();
    return;
  }
  const undo = snapshot();
  mutate(() => {
    const updates = new Map(m.next.filter(note => m.changedIds.includes(note.id)).map(note => [note.id, note]));
    D().knowledgeNotes = D().knowledgeNotes.map(note =>
      updates.has(note.id) ? { ...updates.get(note.id), updatedAt: new Date().toISOString(), updatedBy: D().me } : note,
    );
  });
  closeModal();
  toast(kc('Note properties updated', 'Свойства заметок обновлены'), { action: kc('Undo', 'Отменить'), onAction: () => restore(undo) });
};
