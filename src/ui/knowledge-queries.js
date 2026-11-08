import { knowledgeDisclosure } from './knowledge-disclosure.js';
import { A, IN } from '../actions/actions.js';
import { D, S, save, visibleProjects } from '../core/store.js';
import { esc, uid } from '../core/utils.js';
import { kc, typeName } from './knowledge-types.js';
import { noteTypes } from '../shared/knowledge-types.js';
import { openModal, closeModal } from '../overlays/modals.js';
import { render } from '../shell/render.js';
import { mutate } from './toast.js';
import { validKnowledgeQueries } from '../shared/knowledge-query.js';
const personal = () => {
  try {
    const items = JSON.parse(S.prefs.knowledgeQueries || '[]');
    return validKnowledgeQueries(items) ? items : [];
  } catch {
    return [];
  }
};
export function smartCollections() {
  const section = (items, shared) =>
    items
      .map(
        item =>
          `<div class="row"><button class="btn btn-ghost grow" data-a="applyKnowledgeQuery" data-id="${esc(item.id)}" data-shared="${shared ? '1' : ''}" translate="no">${esc(item.name)}</button>${!shared || S.ui.currentUser?.role === 'admin' ? `<button class="ibtn" data-a="editKnowledgeQuery" data-id="${esc(item.id)}" data-shared="${shared ? '1' : ''}" aria-label="${kc('Edit collection', 'Изменить подборку')}">…</button>` : ''}</div>`,
      )
      .join('');
  return `<details class="knowledge-smart-collections" ${knowledgeDisclosure('catalog', 'collections')} translate="no"><summary>${kc('Smart collections', 'Умные подборки')}</summary><button class="btn btn-ghost" data-a="openKnowledgeIntakeQueue">${kc('Team intake', 'Командный разбор')}</button>${section(personal(), false)}${section(D().ws.knowledgeQueries || [], true)}<button class="btn btn-ghost" data-a="newKnowledgeQuery">${kc('New collection', 'Новая подборка')}</button></details>`;
}
function builder(m) {
  const b = m.builder || {},
    mode = b.mode || 'type',
    types = noteTypes(D().ws),
    fields = [...new Map(types.flatMap(type => type.fields.map(field => [field.id, { ...field, label: `${typeName(type)} / ${typeName(field)}` }]))).values()];
  const field = fields.find(f => f.id === b.field) || fields[0],
    choices =
      mode === 'field' && field?.kind === 'member'
        ? D().members.filter(member => !['removed', 'deactivated'].includes(member.status))
        : mode === 'field' && field?.kind === 'project'
          ? visibleProjects()
          : null;
  return `<details ${m.builder ? 'open' : ''} translate="no"><summary>${kc('Add a condition', 'Добавить условие')}</summary><div class="knowledge-query-builder"><label class="field">${kc('Condition', 'Условие')}<select class="select" data-in="queryBuilder" data-field="mode"><option value="type" ${mode === 'type' ? 'selected' : ''}>${kc('Note type', 'Тип заметки')}</option><option value="tag" ${mode === 'tag' ? 'selected' : ''}>${kc('Tag', 'Тег')}</option><option value="field" ${mode === 'field' ? 'selected' : ''}>${kc('Property', 'Свойство')}</option></select></label>${mode === 'type' ? `<label class="field">${kc('Type', 'Тип')}<select class="select" data-in="queryBuilder" data-field="typeId">${types.map(type => `<option value="${esc(type.id)}" ${b.typeId === type.id ? 'selected' : ''}>${esc(typeName(type))}</option>`).join('')}</select></label>` : mode === 'field' ? `<label class="field">${kc('Property', 'Свойство')}<select class="select" data-in="queryBuilder" data-field="field">${fields.map(field => `<option value="${esc(field.id)}" ${b.field === field.id ? 'selected' : ''}>${esc(field.label)}</option>`).join('')}</select></label><label class="field">${kc('Comparison', 'Сравнение')}<select class="select" data-in="queryBuilder" data-field="op">${['=', '!=', '<', '>', '<=', '>='].map(op => `<option value="${esc(op)}" ${b.op === op ? 'selected' : ''}>${esc(op)}</option>`).join('')}</select></label>` : ''}${mode !== 'type' ? `<label class="field">${kc('Value', 'Значение')}${choices ? `<select class="select" data-in="queryBuilder" data-field="value"><option value="">—</option>${choices.map(item => `<option value="${esc(item.id)}" ${b.value === item.id ? 'selected' : ''}>${esc(item.name)}</option>`).join('')}</select>` : mode === 'field' && field?.kind === 'checkbox' ? `<select class="select" data-in="queryBuilder" data-field="value"><option value="">—</option><option value="true" ${b.value === 'true' ? 'selected' : ''}>${kc('Yes', 'Да')}</option><option value="false" ${b.value === 'false' ? 'selected' : ''}>${kc('No', 'Нет')}</option></select>` : `<input class="input" type="${mode === 'field' && field?.kind === 'date' ? 'date' : mode === 'field' && field?.kind === 'number' ? 'number' : 'text'}" step="any" maxlength="300" data-in="queryBuilder" data-field="value" value="${esc(b.value || '')}">`}</label>` : ''}<button class="btn btn-secondary" data-a="appendQueryCondition">${kc('Add condition', 'Добавить условие')}</button></div></details>`;
}
function form(m, H) {
  return `${H(kc('Smart collection', 'Умная подборка'))}<div class="modal-b" translate="no">${builder(m)}<label class="field">${kc('Name', 'Название')}<input class="input" maxlength="80" data-in="knowledgeQueryDraft" data-field="name" value="${esc(m.item.name)}"></label><label class="field">${kc('Filter expression', 'Условия поиска')}<textarea class="textarea" rows="3" maxlength="1000" data-in="knowledgeQueryDraft" data-field="query">${esc(m.item.query)}</textarea></label><p class="hint">${kc('Up to 16 conditions combined with AND. Examples:', 'До 16 условий, объединённых по И. Примеры:')}<br><code>type:instruction tag:team<br>field:review&lt;2026-12-01<br>has:owner</code></p><label class="field">${kc('Visibility', 'Видимость')}<select class="select" data-in="knowledgeQueryScope" ${S.ui.currentUser?.role !== 'admin' ? 'disabled' : ''}><option value="personal" ${!m.shared ? 'selected' : ''}>${kc('Only me, synced across devices', 'Только я, с синхронизацией')}</option><option value="shared" ${m.shared ? 'selected' : ''}>${kc('Workspace', 'Рабочее пространство')}</option></select></label>${m.error ? `<p class="err" role="alert">${esc(m.error)}</p>` : ''}</div><div class="modal-f" translate="no"><button class="btn btn-secondary" data-a="closeModal">${kc('Cancel', 'Отмена')}</button><button class="btn btn-primary" data-a="saveKnowledgeQuery">${kc('Save', 'Сохранить')}</button>${m.existing ? `<button class="btn btn-ghost" data-a="removeKnowledgeQuery">${kc('Remove collection', 'Убрать подборку')}</button>` : ''}</div>`;
}
A.newKnowledgeQuery = () =>
  openModal({ type: 'knowledgeTool', render: form, item: { id: uid('query'), name: '', query: S.ui.knowledgeQuery || '' }, shared: false });
A.editKnowledgeQuery = el => {
  const shared = el.dataset.shared === '1';
  const item = (shared ? D().ws.knowledgeQueries : personal())?.find(q => q.id === el.dataset.id);
  if (item && (!shared || S.ui.currentUser?.role === 'admin'))
    openModal({ type: 'knowledgeTool', render: form, item: structuredClone(item), shared, originalShared: shared, existing: true });
};
IN.knowledgeQueryDraft = el => {
  S.ui.modals.at(-1).item[el.dataset.field] = el.value;
};
IN.knowledgeQueryScope = el => {
  S.ui.modals.at(-1).shared = el.value === 'shared';
};
function persist(m, remove = false) {
  if ((m.shared || m.originalShared) && S.ui.currentUser?.role !== 'admin') return;
  const own = personal().filter(q => q.id !== m.item.id),
    shared = (D().ws.knowledgeQueries || []).filter(q => q.id !== m.item.id);
  if (!remove) (m.shared ? shared : own).push(m.item);
  if (!validKnowledgeQueries(own) || !validKnowledgeQueries(shared)) {
    m.error = kc('Enter a name; keep at most 20 collections.', 'Укажите название; допускается до 20 подборок.');
    return render();
  }
  const apply = () => {
    S.prefs.knowledgeQueries = JSON.stringify(own);
    if (m.shared || m.originalShared) D().ws.knowledgeQueries = shared;
  };
  if (m.shared || m.originalShared) {
    if (!mutate(apply)) return;
  } else {
    apply();
    save();
  }
  closeModal();
}
A.saveKnowledgeQuery = () => persist(S.ui.modals.at(-1));
A.removeKnowledgeQuery = () => persist(S.ui.modals.at(-1), true);
A.applyKnowledgeQuery = el => {
  const item = (el.dataset.shared === '1' ? D().ws.knowledgeQueries : personal())?.find(q => q.id === el.dataset.id);
  if (!item) return;
  S.ui.knowledgeActiveCollection = { id: item.id, name: item.name, query: item.query, owner: S.ui.currentUser?.id, workspace: D().ws.id || D().ws.url };
  S.ui.knowledgeQuery = item.query;
  S.ui.knowledgeFolder = 'all';
  S.ui.knowledgeTag = '';
  S.ui.knowledgeOffset = 0;
  S.ui.knowledgeMobileFolders = false;
  render();
};

A.knowledgeCaptureCollection = () => {
  S.ui.knowledgeQuery = 'capture:unprocessed';
  S.ui.knowledgeFolder = 'all';
  S.ui.knowledgeTag = '';
  S.ui.knowledgeOffset = 0;
  render();
};

IN.queryBuilder = el => {
  const m = S.ui.modals.at(-1);
  m.builder ||= {};
  if (['mode', 'field'].includes(el.dataset.field)) m.builder.value = '';
  m.builder[el.dataset.field] = el.value;
  if (el.matches('select')) render();
};
A.appendQueryCondition = () => {
  const m = S.ui.modals.at(-1),
    b = m.builder || {},
    mode = b.mode || 'type',
    fields = noteTypes(D().ws).flatMap(type => type.fields);
  let term;
  if (mode === 'type') term = `type:${b.typeId || 'note'}`;
  else {
    const value = (b.value || '').trim();
    if (!value || value.includes('"')) {
      m.error = kc('Enter a value without double quotes.', 'Укажите значение без двойных кавычек.');
      return render();
    }
    term = mode === 'tag' ? `tag:${value}` : `field:${b.field || fields[0]?.id}${b.op || '='}${value}`;
    if (term.includes(' ')) term = `"${term}"`;
  }
  const query = [m.item.query, term].filter(Boolean).join(' ');
  if ((query.match(/"[^"]+"|\S+/g) || []).length > 16) {
    m.error = kc('Use at most 16 conditions.', 'Допускается до 16 условий.');
    return render();
  }
  m.item.query = query;
  m.error = '';
  render();
};
