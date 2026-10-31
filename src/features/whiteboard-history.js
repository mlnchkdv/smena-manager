import { compareWhiteboards } from '../shared/whiteboard-comparison.js';
import { A, confirmDlg } from '../actions/actions.js';
import { D, S } from '../core/store.js';
import { getWhiteboardVersions } from '../core/api.js';
import { whiteboardOf } from '../shared/project-whiteboard.js';
import { canEditWhiteboard } from '../shared/whiteboards.js';
import { currentWhiteboard } from '../core/whiteboard-state.js';
import { whiteboardScope, wbText as T, wbCount as C } from '../core/whiteboard-state.js';
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
  const diff = version && compareWhiteboards(m.base, version.board);
  const author = v => D().members.find(member => member.id === (v.sourceBy || v.by))?.name || T('Author unavailable', 'Автор недоступен');
  const text = n =>
    n
      ? n.type === 'material'
        ? n.target
        : [n.title || n.label, n.text, n.x != null ? `X: ${n.x} · Y: ${n.y}` : ''].filter(Boolean).join(' · ').slice(0, 400)
      : '—';
  return `${H(T('Whiteboard history', 'История холста'))}<div class="modal-b" translate="no"><p class="hint">${T('Compare with the current whiteboard before restoring. The current state will remain in history.', 'Сравните версию с текущим холстом перед восстановлением. Текущее состояние останется в истории.')}</p><details class="whiteboard-history-limits"><summary>${T('History limits', 'Ограничения истории')}</summary><p class="hint">${T('Up to 5 previous versions per whiteboard within a shared 700,000-character budget. Linked materials remain unchanged.', 'До 5 предыдущих версий холста в общем лимите 700 000 символов. Исходные материалы не меняются.')}</p></details>${m.loading ? `<p role="status">${T('Loading…', 'Загрузка…')}</p>` : ''}${m.error ? `<p class="err" role="alert">${esc(m.error)}</p>` : ''}${m.data ? `<div class="whiteboard-version-list">${m.data.versions.map(v => `<button class="btn btn-secondary" data-a="chooseWhiteboardVersion" data-id="${esc(v.id)}" aria-pressed="${v.id === m.version}"><span>${esc(fmtTimestamp(v.sourceAt || v.at))} · ${esc(author(v))}</span><small>${C(v.board.nodes.length, 'card')} · ${C(v.board.edges.length, 'connection')}</small></button>`).join('') || `<p>${T('No previous versions yet. A version is saved when the board changes.', 'Предыдущих версий пока нет. Версия сохраняется при изменении холста.')}</p>`}</div>` : ''}${
    version
      ? `<section class="whiteboard-version-comparison"><h3>${T('Changes on restore', 'Изменения при восстановлении')}</h3><p>${T('Added', 'Добавлено')}: ${diff.added} · ${T('Removed', 'Удалено')}: ${diff.removed} · ${T('Changed', 'Изменено')}: ${diff.changed}</p>${diff.rows
          .slice(0, 50)
          .map(
            r =>
              `<details><summary>${r.kind === 'card' ? T('Card', 'Карточка') : T('Connection', 'Связь')}: ${esc((r.after || r.before).title || (r.after || r.before).label || r.id)}</summary><div class="whiteboard-diff-pair"><section><strong>${T('Current', 'Сейчас')}</strong><p>${esc(text(r.before))}</p></section><section><strong>${T('Selected version', 'Выбранная версия')}</strong><p>${esc(text(r.after))}</p></section></div></details>`,
          )
          .join(
            '',
          )}${diff.rows.length > 50 ? `<p class="hint">${T('First 50 changes shown. The full version is below.', 'Показаны первые 50 изменений. Полная версия ниже.')}</p>` : ''}</section><h3>${T('Version preview', 'Предпросмотр версии')}</h3><div class="whiteboard-version-preview">${version.board.nodes
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
