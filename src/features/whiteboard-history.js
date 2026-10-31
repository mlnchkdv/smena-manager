import { A, confirmDlg } from '../actions/actions.js';
import { D, S } from '../core/store.js';
import { getWhiteboardVersions } from '../core/api.js';
import { whiteboardOf } from '../shared/project-whiteboard.js';
import { canEditWhiteboard } from '../shared/whiteboards.js';
import { currentWhiteboard } from '../core/whiteboard-state.js';
import { whiteboardScope, wbText as T } from '../core/whiteboard-state.js';
import { whiteboardCommand } from './project-whiteboard.js';
import { workspaceSyncIsClean } from '../core/workspace-sync.js';
import { esc, fmtTimestamp } from '../core/utils.js';
import { openModal, closeModal } from '../overlays/modals.js';
import { render } from '../shell/render.js';
import { toast } from '../ui/toast.js';
const current = currentWhiteboard;
const active = () => {
  const m = S.ui.modals.at(-1);
  return m?.historyBoard && m.scope === whiteboardScope(m.project) && current()?.id === m.project ? m : null;
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function form(m, H) {
  const version = m.data?.versions.find(v => v.id === m.version),
    p = current();
  return `${H(T('Whiteboard history', 'История холста'))}<div class="modal-b" translate="no"><p class="hint">${T('Up to 5 previous versions per project, within a shared 700,000-character history budget. Restore changes only this board; materials remain unchanged.', 'До 5 предыдущих версий проекта в пределах общего лимита истории 700 000 символов. Восстанавливается только холст; исходные материалы не меняются.')}</p>${m.loading ? `<p role="status">${T('Loading…', 'Загрузка…')}</p>` : ''}${m.error ? `<p class="err" role="alert">${esc(m.error)}</p>` : ''}${m.data ? `<div class="whiteboard-version-list">${m.data.versions.map(v => `<button class="btn btn-secondary" data-a="chooseWhiteboardVersion" data-id="${esc(v.id)}" aria-pressed="${v.id === m.version}">${esc(fmtTimestamp(v.at))} · ${v.board.nodes.length} ${T('cards', 'карточек')} · ${v.board.edges.length} ${T('connections', 'связей')}</button>`).join('') || `<p>${T('No previous versions yet. A version is saved when the board changes.', 'Предыдущих версий пока нет. Версия сохраняется при изменении холста.')}</p>`}</div>` : ''}${
    version
      ? `<h3>${T('Version preview', 'Предпросмотр версии')}</h3><div class="whiteboard-version-preview">${version.board.nodes
          .slice(0, m.limit || 50)
          .map(
            n =>
              `<details><summary>${esc(n.type === 'material' ? T('Linked material', 'Связанный материал') : n.title || T('Untitled card', 'Карточка без названия'))}</summary><p>${esc(n.type === 'material' ? n.target : n.text)}</p></details>`,
          )
          .join(
            '',
          )}${version.board.nodes.length > (m.limit || 50) ? `<button class="btn btn-ghost" data-a="moreWhiteboardVersion">${T('Show more', 'Показать ещё')}</button>` : ''}</div>`
      : ''
  }</div><div class="modal-f" translate="no"><button class="btn btn-secondary" data-a="closeModal">${T('Close', 'Закрыть')}</button>${version && p && !p.archived && canEditWhiteboard(D(), p, D().me, S.ui.currentUser?.role) ? `<button class="btn btn-primary" data-a="restoreWhiteboardVersion">${T('Restore version', 'Восстановить версию')}</button>` : ''}</div>`;
}
A.whiteboardHistory = async () => {
  const p = current();
  if (!p) return;
  const m = {
    type: 'whiteboardTool',
    historyBoard: true,
    render: form,
    project: p.id,
    scope: whiteboardScope(p.id),
    base: structuredClone(whiteboardOf(p)),
    loading: true,
    limit: 50,
  };
  openModal(m);
  try {
    const data = await getWhiteboardVersions(p.id);
    if (active() !== m) return;
    m.data = data;
    m.version = data.versions[0]?.id;
    m.loading = false;
    render();
  } catch {
    if (active() === m) {
      m.loading = false;
      m.error = T('History could not be loaded. Reopen it to try again.', 'Не удалось загрузить историю. Откройте её повторно.');
      render();
    }
  }
};
A.chooseWhiteboardVersion = el => {
  const m = active();
  if (m?.data?.versions.some(v => v.id === el.dataset.id)) {
    m.version = el.dataset.id;
    m.limit = 50;
    render();
  }
};
A.moreWhiteboardVersion = () => {
  const m = active();
  if (m) {
    m.limit = Math.min(200, (m.limit || 50) + 50);
    render();
  }
};
A.restoreWhiteboardVersion = () => {
  const m = active(),
    p = current(),
    v = m?.data?.versions.find(v => v.id === m.version);
  if (!v || !p || p.archived || !canEditWhiteboard(D(), p, D().me, S.ui.currentUser?.role)) return;
  const ready = () =>
    current()?.id === m.project &&
    m.scope === whiteboardScope(m.project) &&
    workspaceSyncIsClean(S.data) &&
    same(whiteboardOf(current()), m.base) &&
    same(m.base, m.data.board);
  if (!ready())
    return toast(
      T(
        'Save or refresh the board, then reopen its history before restoring.',
        'Сохраните или обновите холст и заново откройте историю перед восстановлением.',
      ),
      { kind: 'info' },
    );
  confirmDlg({
    title: T('Restore this whiteboard version?', 'Восстановить эту версию холста?'),
    body: esc(
      T(
        'The current board will be saved in history. Tasks and linked materials are unchanged.',
        'Текущий холст будет сохранён в истории. Задачи и связанные материалы останутся без изменений.',
      ),
    ),
    ok: T('Restore version', 'Восстановить версию'),
    run: () => {
      if (!ready()) return toast(T('The board changed. Reopen its history.', 'Холст изменился. Откройте историю заново.'), { kind: 'info' });
      if (whiteboardCommand(next => Object.assign(next, structuredClone(v.board)), { id: v.id, baseHash: m.data.baseHash })) closeModal();
    },
  });
};
