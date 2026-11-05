import { A, IN } from '../actions/actions.js';
import { S, D } from '../core/store.js';
import { esc, ago } from '../core/utils.js';
import { kc, typeName } from './knowledge-types.js';
import { noteTypes, noteType } from '../shared/knowledge-types.js';
import { knowledgeColumnValue, normalizeKnowledgeColumnSort } from '../shared/knowledge-columns.js';
import { saveKnowledgePreferences } from '../core/knowledge-preferences.js';
import { render } from '../shell/render.js';
import { openModal } from '../overlays/modals.js';
export const collectionColumns = () => [
  { key: 'type', label: kc('Type', 'Тип') },
  { key: 'tags', label: kc('Tags', 'Теги') },
  { key: 'updated', label: kc('Updated', 'Обновлено') },
  ...noteTypes(D().ws).flatMap(type =>
    type.fields.map(field => ({ key: `property:${type.id}:${field.id}`, label: `${typeName(type)} · ${typeName(field)}`, kind: field.kind })),
  ),
];
function displayValue(note, column) {
  if (column.key === 'type') return typeName(noteType(note, D().ws));
  if (column.key === 'updated') return ago(note.updatedAt);
  const value = knowledgeColumnValue(note, column.key);
  return value == null || value === ''
    ? '—'
    : column.kind === 'member'
      ? D().members.find(member => member.id === value)?.name || '—'
      : column.kind === 'project'
        ? D().projects.find(project => project.id === value)?.name || '—'
        : typeof value === 'boolean'
          ? value
            ? kc('Yes', 'Да')
            : kc('No', 'Нет')
          : String(value);
}
const visibleColumns = () =>
  collectionColumns()
    .filter(column => (S.ui.knowledgeColumns || ['type', 'tags', 'updated']).includes(column.key))
    .slice(0, 6);
export function currentKnowledgeTableSort() {
  const sort = normalizeKnowledgeColumnSort(
    S.ui.knowledgeTableSort,
    visibleColumns().map(column => column.key),
  );
  S.ui.knowledgeTableSort = sort;
  return sort;
}
export function knowledgeCollectionTable(notes, readOnly) {
  const columns = visibleColumns();
  const sort = currentKnowledgeTableSort();
  return `<div class="knowledge-preview-grid knowledge-collection-table-wrap" translate="no"><div class="row wrap"><button class="btn btn-secondary btn-sm" data-a="configureKnowledgeColumns">${kc('Columns', 'Столбцы')}</button><label><span class="sr">${kc('Sort column', 'Сортировка по столбцу')}</span><select class="select" data-in="knowledgeColumnSort"><option value="title" ${sort?.key === 'title' ? 'selected' : ''}>${kc('Note title', 'Название заметки')}</option>${columns.map(column => `<option value="${esc(column.key)}" ${sort?.key === column.key ? 'selected' : ''}>${esc(column.label)}</option>`).join('')}</select></label><button class="btn btn-ghost btn-sm" data-a="toggleKnowledgeColumnDirection">${sort?.desc ? kc('Descending', 'По убыванию') : kc('Ascending', 'По возрастанию')}</button></div><table class="knowledge-collection-table"><caption class="sr">${kc('Note collection', 'Коллекция заметок')}</caption><thead><tr><th scope="col">${kc('Note title', 'Название заметки')}</th>${columns.map(column => `<th scope="col">${esc(column.label)}</th>`).join('')}</tr></thead><tbody>${notes.map(note => `<tr class="knowledge-preview-card" data-id="${esc(note.id)}"><td class="knowledge-collection-title">${!readOnly ? `<input type="checkbox" data-in="knowledgeSelect" data-id="${esc(note.id)}" aria-label="${esc(kc('Select note: ', 'Выбрать заметку: ') + note.title)}" ${(S.ui.knowledgeSelection || []).includes(note.id) ? 'checked' : ''}>` : ''}<button class="knowledge-preview-open btn btn-ghost" data-a="openKnowledgeNote" data-id="${esc(note.id)}">${esc(note.title)}</button></td>${columns.map(column => `<td data-label="${esc(column.label)}"><span>${esc(displayValue(note, column))}</span></td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
A.configureKnowledgeColumns = () =>
  openModal({
    type: 'knowledgeTool',
    render: (_m, H) =>
      H(kc('Collection columns', 'Столбцы коллекции')) +
      `<div class="modal-b" translate="no"><p class="hint">${kc('Choose up to six. Saved for this account and workspace on this device.', 'Выберите до шести. Настройка сохраняется для аккаунта и пространства на этом устройстве.')}</p>${collectionColumns()
        .map(
          column =>
            `<label class="row" style="padding-block:6px"><input type="checkbox" data-in="knowledgeColumn" data-key="${esc(column.key)}" ${(S.ui.knowledgeColumns || ['type', 'tags', 'updated']).includes(column.key) ? 'checked' : ''}>${esc(column.label)}</label>`,
        )
        .join('')}</div>`,
  });
IN.knowledgeColumn = el => {
  const chosen = new Set(S.ui.knowledgeColumns || ['type', 'tags', 'updated']);
  if (el.checked && chosen.size >= 6) {
    el.checked = false;
    return;
  }
  el.checked ? chosen.add(el.dataset.key) : chosen.delete(el.dataset.key);
  S.ui.knowledgeColumns = [...chosen];
  currentKnowledgeTableSort();
  S.ui.knowledgeOffset = 0;
  saveKnowledgePreferences();
  render();
};
IN.knowledgeColumnSort = el => {
  S.ui.knowledgeTableSort = { key: el.value, desc: false };
  S.ui.knowledgeOffset = 0;
  saveKnowledgePreferences();
  render();
};
A.toggleKnowledgeColumnDirection = () => {
  S.ui.knowledgeTableSort = { key: S.ui.knowledgeTableSort?.key || 'title', desc: !S.ui.knowledgeTableSort?.desc };
  S.ui.knowledgeOffset = 0;
  saveKnowledgePreferences();
  render();
};
