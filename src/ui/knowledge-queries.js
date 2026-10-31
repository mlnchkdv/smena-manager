import { A, IN } from '../actions/actions.js';
import { D, S, save } from '../core/store.js';
import { esc, uid } from '../core/utils.js';
import { kc } from './knowledge-types.js';
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
  return `<details class="knowledge-smart-collections" translate="no"><summary>${kc('Smart collections', 'Умные подборки')}</summary><button class="btn btn-ghost" data-a="knowledgeCaptureCollection">${kc('To process', 'На разбор')}</button>${section(personal(), false)}${section(D().ws.knowledgeQueries || [], true)}<button class="btn btn-ghost" data-a="newKnowledgeQuery">${kc('New collection', 'Новая подборка')}</button></details>`;
}
function form(m, H) {
  return `${H(kc('Smart collection', 'Умная подборка'))}<div class="modal-b" translate="no"><label class="field">${kc('Name', 'Название')}<input class="input" maxlength="80" data-in="knowledgeQueryDraft" data-field="name" value="${esc(m.item.name)}"></label><label class="field">${kc('Filter expression', 'Условия поиска')}<textarea class="textarea" rows="3" maxlength="1000" data-in="knowledgeQueryDraft" data-field="query">${esc(m.item.query)}</textarea></label><p class="hint">${kc('All conditions are combined with AND. Examples:', 'Все условия объединяются по И. Примеры:')}<br><code>type:instruction tag:team<br>field:review&lt;2026-12-01<br>has:owner</code></p><label class="field">${kc('Visibility', 'Видимость')}<select class="select" data-in="knowledgeQueryScope" ${S.ui.currentUser?.role !== 'admin' ? 'disabled' : ''}><option value="personal" ${!m.shared ? 'selected' : ''}>${kc('Only me, synced across devices', 'Только я, с синхронизацией')}</option><option value="shared" ${m.shared ? 'selected' : ''}>${kc('Workspace', 'Рабочее пространство')}</option></select></label>${m.error ? `<p class="err" role="alert">${esc(m.error)}</p>` : ''}</div><div class="modal-f" translate="no"><button class="btn btn-secondary" data-a="closeModal">${kc('Cancel', 'Отмена')}</button><button class="btn btn-primary" data-a="saveKnowledgeQuery">${kc('Save', 'Сохранить')}</button>${m.existing ? `<button class="btn btn-ghost" data-a="removeKnowledgeQuery">${kc('Remove collection', 'Убрать подборку')}</button>` : ''}</div>`;
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
  S.ui.knowledgeQuery = item.query;
  S.ui.knowledgeFolder = 'all';
  S.ui.knowledgeTag = '';
  S.ui.knowledgeOffset = 0;
  render();
};

A.knowledgeCaptureCollection = () => {
  S.ui.knowledgeQuery = 'capture:unprocessed';
  S.ui.knowledgeFolder = 'all';
  S.ui.knowledgeTag = '';
  S.ui.knowledgeOffset = 0;
  render();
};
