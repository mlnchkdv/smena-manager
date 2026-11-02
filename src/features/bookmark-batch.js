import { A, IN } from '../actions/actions.js';
import { D, S } from '../core/store.js';
import { esc } from '../core/utils.js';
import { isRussian } from '../core/i18n.js';
import { render } from '../shell/render.js';
import { mutate, toast } from '../ui/toast.js';
import { openModal, closeModal } from '../overlays/modals.js';
import { applyBookmarkBatch } from '../shared/bookmark-batch.js';
const T = (en, ru) => (isRussian() ? ru : en);
const scope = () => JSON.stringify([S.ui.currentUser?.id, D().ws.id || D().ws.url]);
IN.bookmarkSelect = el => {
  const selected = new Set(S.ui.bookmarkSelection || []);
  el.checked ? selected.add(el.dataset.id) : selected.delete(el.dataset.id);
  S.ui.bookmarkSelection = [...selected];
  S.ui.bookmarkSelectionNotice = false;
  render();
};
IN.bookmarkSelectPage = el => {
  S.ui.bookmarkSelection = el.checked ? [...(S.ui.bookmarkPageIds || [])] : [];
  S.ui.bookmarkSelectionNotice = false;
  render();
};
A.clearBookmarkSelection = () => {
  S.ui.bookmarkSelection = [];
  render();
};
A.bookmarkBatch = () => {
  if (!['admin', 'editor'].includes(S.ui.currentUser?.role) || !S.ui.bookmarkSelection?.length) return;
  openModal({
    type: 'knowledgeTool',
    scope: scope(),
    ids: [...S.ui.bookmarkSelection],
    render: (m, H) =>
      H(T('Selected bookmarks', 'Выбранные закладки')) +
      '<div class="modal-b"><p>' +
      T('Selected: ', 'Выбрано: ') +
      m.ids.length +
      '</p><label class="field">' +
      T('Destination folder', 'Папка назначения') +
      '<select class="select" id="bookmark-batch-folder"><option value="">' +
      T('No folder', 'Без папки') +
      '</option>' +
      (D().linkFolders || []).map(f => '<option value="' + esc(f.id) + '" translate="no">' + esc(f.name) + '</option>').join('') +
      '</select></label><button class="btn btn-secondary" data-a="applyBookmarkBatch" data-command="move">' +
      T('Move', 'Переместить') +
      '</button><label class="field">' +
      T('Tag', 'Тег') +
      '<input class="input" id="bookmark-batch-tag" maxlength="64"></label><div class="row" style="flex-wrap:wrap;gap:8px">' +
      ['addTag', 'removeTag', 'archive', 'restore']
        .map(
          (op, i) =>
            '<button class="btn btn-secondary" data-a="applyBookmarkBatch" data-command="' +
            op +
            '">' +
            [T('Add tag', 'Добавить тег'), T('Remove tag', 'Убрать тег'), T('Archive', 'В архив'), T('Restore', 'Восстановить')][i] +
            '</button>',
        )
        .join('') +
      '</div><p class="hint">' +
      T(
        'Favorites and shared reading status remain unchanged. Archived links can be restored.',
        'Избранное и общий статус прочтения сохраняются. Архивные закладки можно восстановить.',
      ) +
      '</p></div><div class="modal-f"><button class="btn btn-secondary" data-a="closeModal">' +
      T('Cancel', 'Отмена') +
      '</button></div>',
  });
};
A.applyBookmarkBatch = el => {
  const modal = S.ui.modals.at(-1);
  if (!modal?.ids || modal.scope !== scope() || !['admin', 'editor'].includes(S.ui.currentUser?.role)) return;
  const command = {
    type: el.dataset.command,
    folder: document.getElementById('bookmark-batch-folder')?.value || '',
    tag: document.getElementById('bookmark-batch-tag')?.value || '',
  };
  let result;
  try {
    if (
      !mutate(() => {
        result = applyBookmarkBatch(D(), modal.ids, command, S.ui.currentUser.role);
        S.ui.bookmarkSelection = [];
      })
    )
      return;
  } catch (error) {
    return toast(error.message, { kind: 'err' });
  }
  closeModal();
  toast(
    T('Changed: ', 'Изменено: ') +
      result.changed.length +
      (result.failed.length ? T(' · Skipped (removed or tag limit): ', ' · Пропущено (удалены или лимит тегов): ') + result.failed.length : ''),
    { kind: result.failed.length ? 'info' : 'ok' },
  );
};
