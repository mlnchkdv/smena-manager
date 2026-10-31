import { A, IN } from '../actions/actions.js';
import { D, S, save, visibleProjects } from '../core/store.js';
import { esc, fmtDate } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { kc, typeName } from './knowledge-types.js';
import { noteType, noteTypes } from '../shared/knowledge-types.js';
import { cardMetaPreferences } from '../shared/knowledge-card-meta.js';
import { openModal, closeModal } from '../overlays/modals.js';
import { render } from '../shell/render.js';
export function noteCardMeta(note) {
  const config = cardMetaPreferences(S.prefs.knowledgeCardMeta),
    type = noteType(note, D().ws);
  const selected = (Object.hasOwn(config.fields, type.id) ? config.fields[type.id] : null) || type.fields.slice(0, 2).map(f => f.id);
  const values = type.fields
    .filter(f => selected.includes(f.id))
    .map(field => {
      let value = note.properties?.[field.id];
      if (value == null || value === '') return '';
      if (field.kind === 'project') value = visibleProjects().find(p => p.id === value)?.name;
      if (field.kind === 'member') value = D().members.find(m => m.id === value && !['removed', 'deactivated'].includes(m.status))?.name;
      if (field.kind === 'checkbox') value = value ? kc('Yes', 'Да') : kc('No', 'Нет');
      if (field.kind === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(value || '')) value = fmtDate(value);
      return value == null || value === ''
        ? ''
        : `<span title="${esc(typeName(field) + ': ' + value)}"><b>${esc(typeName(field))}:</b> ${esc(String(value).slice(0, 150))}</span>`;
    })
    .filter(Boolean)
    .slice(0, 3);
  const showType = config.showType && (type.id !== 'note' || !!S.prefs.knowledgeCardMeta);
  return showType || values.length
    ? `<div class="knowledge-card-meta" translate="no">${showType ? `<span class="knowledge-card-type">${ic('shapes', 12)}${esc(typeName(type))}</span>` : ''}${values.join('')}</div>`
    : '';
}
function form(m, H) {
  const type = noteTypes(D().ws).find(t => t.id === m.typeId) || noteTypes(D().ws)[0];
  const selected = (Object.hasOwn(m.config.fields, type.id) ? m.config.fields[type.id] : null) || type.fields.slice(0, 2).map(f => f.id);
  return `${H(kc('Card details', 'Сведения в карточках'))}<div class="modal-b" translate="no"><label class="knowledge-card-config-row"><input type="checkbox" data-in="cardMetaType" ${m.config.showType ? 'checked' : ''}>${kc('Show note type', 'Показывать тип заметки')}</label><label class="field">${kc('Note type', 'Тип заметки')}<select class="select" data-in="cardMetaChooseType" aria-label="${kc('Note type', 'Тип заметки')}">${noteTypes(
    D().ws,
  )
    .map(t => `<option value="${esc(t.id)}" ${t.id === type.id ? 'selected' : ''}>${esc(typeName(t))}</option>`)
    .join(
      '',
    )}</select></label><p class="hint">${kc('Choose up to three properties. Empty or unavailable values are hidden.', 'Выберите до трёх свойств. Пустые и недоступные значения скрыты.')}</p>${type.fields.map(f => `<label class="knowledge-card-config-row"><input type="checkbox" data-in="cardMetaField" data-field="${esc(f.id)}" ${selected.includes(f.id) ? 'checked' : ''} ${selected.length >= 3 && !selected.includes(f.id) ? 'disabled' : ''}>${esc(typeName(f))}</label>`).join('') || `<p class="hint">${kc('This type has no properties.', 'У этого типа нет свойств.')}</p>`}</div><div class="modal-f"><button class="btn btn-secondary" data-a="closeModal">${kc('Cancel', 'Отмена')}</button><button class="btn btn-primary" data-a="applyCardMeta">${kc('Apply', 'Применить')}</button></div>`;
}
A.configureCardMeta = () =>
  openModal({
    type: 'knowledgeTool',
    render: form,
    cardMeta: true,
    typeId: noteTypes(D().ws).find(t => t.fields.length)?.id || 'note',
    config: cardMetaPreferences(S.prefs.knowledgeCardMeta),
  });
const modal = () => {
  const m = S.ui.modals.at(-1);
  return m?.cardMeta ? m : null;
};
IN.cardMetaType = el => {
  const m = modal();
  if (m) m.config.showType = el.checked;
};
IN.cardMetaChooseType = el => {
  const m = modal();
  if (m) {
    m.typeId = el.value;
    render();
  }
};
IN.cardMetaField = el => {
  const m = modal();
  if (!m) return;
  const type = noteTypes(D().ws).find(t => t.id === m.typeId);
  if (!type?.fields.some(f => f.id === el.dataset.field)) return;
  const fields = new Set((Object.hasOwn(m.config.fields, type.id) ? m.config.fields[type.id] : null) || type.fields.slice(0, 2).map(f => f.id));
  el.checked ? fields.add(el.dataset.field) : fields.delete(el.dataset.field);
  m.config.fields[type.id] = [...fields].slice(0, 3);
  render();
};
A.applyCardMeta = () => {
  const m = modal();
  if (m) {
    S.prefs.knowledgeCardMeta = JSON.stringify(m.config);
    save();
    closeModal();
  }
};
