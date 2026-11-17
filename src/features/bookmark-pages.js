import { S, D } from '../core/store.js';
import { bookmarkPageRequest, getSessionGeneration } from '../core/api.js';
import { isRussian } from '../core/i18n.js';
import { normalizedPageUrl, applyBookmarkMetadata } from '../shared/bookmark-metadata.js';
import { A, IN } from '../actions/actions.js';
import { openModal } from '../overlays/modals.js';
import { render } from '../shell/render.js';
import { esc } from '../core/utils.js';
import { refreshWorkspaceFromServer } from '../core/bootstrap.js';
import { toast } from '../ui/toast.js';
import { bookmarkArchiveView, bookmarkArchiveUrl } from '../ui/bookmark-archive.js';

const words = (en, ru) => (isRussian() ? ru : en);
let timer, controller;
function status(text) {
  const field = document.querySelector('[data-bookmark-metadata-status]');
  if (field) field.textContent = text;
}
export function scheduleBookmarkMetadata() {
  clearTimeout(timer);
  controller?.abort();
  status('');
  if (!S.ui.bookmarkEditing && normalizedPageUrl(S.ui.bookmarkDraft?.url || '')) timer = setTimeout(loadBookmarkMetadata, 750);
}
export async function loadBookmarkMetadata() {
  clearTimeout(timer);
  controller?.abort();
  const draft = S.ui.bookmarkDraft;
  const url = normalizedPageUrl(draft?.url || '');
  if (!S.ui.bookmarkForm || !url) return;
  controller = new AbortController();
  const current = controller;
  const baseline = { ...draft };
  status(words('Getting page details…', 'Получаем сведения о странице…'));
  try {
    const metadata = await bookmarkPageRequest('/metadata', { method: 'POST', body: JSON.stringify({ url }), signal: current.signal });
    if (current.signal.aborted || !S.ui.bookmarkForm || S.ui.bookmarkDraft !== draft || normalizedPageUrl(draft.url) !== url) return;
    const keys = applyBookmarkMetadata(draft, metadata, baseline);
    for (const key of keys) {
      const input = document.getElementById(`bookmark-${key}`);
      if (input) input.value = draft[key];
    }
    status(words('Page details added. You can edit them.', 'Сведения добавлены. Их можно изменить.'));
  } catch {
    if (!current.signal.aborted && S.ui.bookmarkForm && S.ui.bookmarkDraft === draft)
      status(words('Could not get page details. Fill in the fields manually or retry.', 'Не удалось получить сведения. Заполните поля вручную или повторите.'));
  }
}
A.bookmarkMetadata = loadBookmarkMetadata;

const currentViewer = m => S.ui.modals.includes(m) && m.generation === getSessionGeneration();
function pageFailure(error, saving = false) {
  if (error.code === 'PAGE_SNAPSHOT_LIMIT')
    return words(
      'There are 10 active copies. Move a copy to stored versions to make room, or download it.',
      'Уже есть 10 активных копий. Перенесите копию в сохранённые версии, чтобы освободить место, или скачайте её.',
    );
  if (error.code === 'PAGE_TOO_LARGE')
    return words('The page is too large to capture. Open the original website.', 'Страница слишком большая для копии. Откройте оригинал.');
  if (error.code === 'PAGE_RATE_LIMIT') return words('Too many requests. Wait a minute and retry.', 'Слишком много запросов. Повторите через минуту.');
  if (error.code === 'PAGE_SNAPSHOT_UNAVAILABLE')
    return words('This saved copy is unavailable or failed verification. Try another copy.', 'Эта копия недоступна или не прошла проверку. Выберите другую.');
  if (saving)
    return words(
      'Could not save this page copy. Previous copies are safe. Check the connection and retry.',
      'Не удалось сохранить копию страницы. Предыдущие копии сохранены. Проверьте соединение и повторите.',
    );
  return words(
    'The website could not be read. It may require sign-in, block capture or be unavailable. Existing saved copies still work.',
    'Не удалось прочитать сайт. Возможно, нужен вход, сайт запрещает чтение или недоступен. Ранее сохранённые копии остаются доступны.',
  );
}
function viewer(m, H) {
  const stamp = value => new Date(value).toLocaleString(isRussian() ? 'ru-RU' : 'en-US');
  const selected = m.snapshots.find(ref => ref.id === m.selected);
  const source = m.selected === 'live' ? m.url : normalizedPageUrl(m.page?.url || selected?.finalUrl || selected?.sourceUrl || '') || m.url;
  const active = m.snapshots.filter(ref => !ref.isArchived);
  const versionOptions = m.snapshots
    .filter(ref => !ref.isArchived || ref.id === m.selected)
    .map(
      ref =>
        `<option value="${esc(ref.id)}" ${m.selected === ref.id ? 'selected' : ''}>${ref.format === 'html' ? words('HTML archive', 'HTML-архив') : words('Text copy', 'Текстовая копия')} · ${esc(stamp(ref.capturedAt))}</option>`,
    )
    .join('');
  const archiveButton =
    S.ui.currentUser?.role !== 'viewer'
      ? `<button class="btn btn-secondary" data-a="saveBookmarkPage" ${m.busy || active.length >= 10 ? 'disabled' : ''}>${words('Archive page', 'Архивировать страницу')}</button>`
      : '';
  return `${H(words('Bookmark viewer', 'Просмотр закладки'))}<div class="modal-b" translate="no">
    <div class="bookmark-viewer-heading"><h3 class="bookmark-viewer-title" title="${esc(m.title)}">${esc(m.title)}</h3><p class="hint bookmark-viewer-url" title="${esc(source)}">${esc(source)}</p>${source !== m.url ? `<p class="hint bookmark-viewer-url">${words('Current bookmark URL: ', 'Текущий адрес закладки: ')}${esc(m.url)}</p>` : ''}</div>
    <div class="bookmark-viewer-toolbar"><label class="field">${words('Page version', 'Версия страницы')}<select class="select" data-in="bookmarkSnapshot" ${m.busy ? 'disabled' : ''}><option value="live" ${m.selected === 'live' ? 'selected' : ''}>${words('Current website', 'Сейчас на сайте')}</option>${versionOptions}</select></label>${archiveButton}<a class="btn btn-ghost" href="${esc(source)}" target="_blank" rel="noopener noreferrer" aria-label="${words('Open original', 'Открыть оригинал')}">${words('Original', 'Оригинал')}</a></div>
    ${m.snapshots.length ? `<details class="bookmark-version-manager" ${m.managing || active.length >= 10 ? 'open' : ''}><summary>${words('Manage saved copies', 'Управление копиями')} · ${active.length}/10</summary><p class="hint">${words('Stored versions remain readable and recoverable. Moving them out of the active list frees a slot without deleting the file.', 'Сохранённые версии доступны для просмотра и восстановления. Перенос из активного списка освобождает место без удаления файла.')}</p><ul>${m.snapshots.map(ref => `<li><div><strong>${esc(stamp(ref.capturedAt))} · ${ref.format === 'html' ? 'HTML' : words('Text', 'Текст')}</strong><span class="hint bookmark-viewer-url">${esc(ref.finalUrl || ref.sourceUrl || m.url)}</span>${ref.isArchived ? `<span class="badge">${words('Stored version', 'Сохранённая версия')}</span>` : ''}</div><div class="bookmark-version-actions"><button class="btn btn-ghost btn-sm" data-a="openBookmarkCopy" data-id="${esc(ref.id)}" ${m.busy ? 'disabled' : ''}>${words('View', 'Открыть')}</button>${ref.format === 'html' ? `<a class="btn btn-ghost btn-sm" href="${esc(bookmarkArchiveUrl(m.id, ref.id))}&download=1">HTML ↓</a>` : ''}${S.ui.currentUser?.role !== 'viewer' ? `<button class="btn btn-secondary btn-sm" data-a="storeBookmarkCopy" data-id="${esc(ref.id)}" data-archived="${!ref.isArchived}" ${m.busy || (ref.isArchived && active.length >= 10) ? 'disabled' : ''}>${ref.isArchived ? words('Restore', 'Вернуть') : words('Store version', 'Убрать из активных')}</button>` : ''}</div></li>`).join('')}</ul></details>` : ''}
    <details class="bookmark-page-notice"><summary>${words('About HTML archives', 'Об HTML-архивах')}</summary><p class="hint">${words('Archives keep the public HTML, CSS, images and fonts downloaded at capture time. Scripts and embedded pages are disabled. JavaScript-only or sign-in content may be absent; unavailable resources are reported. Up to 10 active copies per bookmark; stored versions are retained.', 'Архивы сохраняют публичный HTML, стили, изображения и шрифты, загруженные в момент архивации. Скрипты и встроенные страницы отключены. Содержимое, доступное только через JavaScript или после входа, может отсутствовать; недоступные ресурсы отмечаются. До 10 активных копий на закладку; сохранённые версии не удаляются.')}</p></details>
    ${m.busy ? `<p role="status">${m.saving ? words('Saving a page copy…', 'Сохраняем копию страницы…') : words('Loading page…', 'Загружаем страницу…')}</p>` : ''}${m.error ? `<p class="err" role="alert">${esc(m.error)}</p><button class="btn btn-secondary" data-a="reloadBookmarkPage">${words('Retry', 'Повторить')}</button>` : ''}
    ${m.page && !m.busy ? `<p class="hint" role="status">${m.selected === 'live' ? words('Text preview — not archived.', 'Текстовый предпросмотр — страница ещё не архивирована.') : words('Saved archive. The original website is not requested when you open it.', 'Сохранённый архив. При открытии оригинальный сайт не запрашивается.')} · ${esc(stamp(m.page.capturedAt))}</p>${bookmarkArchiveView(m, isRussian())}` : ''}
    </div>`;
}
A.bookmarkArchiveView = el => {
  const m = S.ui.modals.at(-1);
  if (m?.type === 'bookmarkViewer' && !m.busy) {
    m.archiveView = el.dataset.value === 'text' ? 'text' : 'html';
    render();
  }
};
async function loadPage(m) {
  m.controller?.abort();
  m.controller = new AbortController();
  m.busy = true;
  m.error = '';
  m.page = null;
  render();
  try {
    const path = `/${encodeURIComponent(m.id)}`;
    const options = { signal: m.controller.signal };
    m.page = await bookmarkPageRequest(
      m.selected === 'live' ? path + '/preview' : path + '/snapshots/' + encodeURIComponent(m.selected),
      m.selected === 'live' ? { ...options, method: 'POST' } : options,
    );
  } catch (error) {
    if (currentViewer(m)) m.error = pageFailure(error);
  } finally {
    m.busy = false;
    if (currentViewer(m)) render();
  }
}
A.viewBookmarkPage = async el => {
  const link = D().links?.find(row => row.id === el.dataset.id);
  if (!link || !normalizedPageUrl(link.url)) return;
  const m = {
    type: 'bookmarkViewer',
    id: link.id,
    title: link.title,
    url: link.url,
    snapshots: [...(link.pageSnapshots || [])],
    generation: getSessionGeneration(),
    render: viewer,
  };
  m.selected = m.snapshots.find(ref => !ref.isArchived)?.id || 'live';
  m.onClose = () => m.controller?.abort();
  m.beforeClose = () => {
    if (m.saving) {
      toast(words('Please wait for the page copy to finish saving.', 'Дождитесь сохранения копии страницы.'), { kind: 'info' });
      return false;
    }
    return true;
  };
  openModal(m);
  await loadPage(m);
};
IN.bookmarkSnapshot = async el => {
  const m = S.ui.modals.at(-1);
  if (m?.type !== 'bookmarkViewer' || m.busy) return;
  m.selected = el.value;
  await loadPage(m);
};
A.reloadBookmarkPage = () => {
  const m = S.ui.modals.at(-1);
  if (m?.type === 'bookmarkViewer' && !m.busy) return loadPage(m);
};
A.openBookmarkCopy = el => {
  const m = S.ui.modals.at(-1);
  if (m?.type !== 'bookmarkViewer' || m.busy) return;
  m.selected = el.dataset.id;
  m.managing = true;
  return loadPage(m);
};
A.storeBookmarkCopy = async el => {
  const m = S.ui.modals.at(-1);
  if (m?.type !== 'bookmarkViewer' || m.busy || S.ui.currentUser?.role === 'viewer') return;
  m.busy = m.saving = true;
  m.managing = true;
  m.error = '';
  render();
  try {
    const result = await bookmarkPageRequest(`/${encodeURIComponent(m.id)}/snapshots/${encodeURIComponent(el.dataset.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ isArchived: el.dataset.archived === 'true' }),
    });
    if (!currentViewer(m)) return;
    m.snapshots = result.snapshots;
    await refreshWorkspaceFromServer().catch(() => {});
    toast(words('Saved copies updated. Files are retained.', 'Список копий обновлён. Файлы сохранены.'));
  } catch (error) {
    if (currentViewer(m)) m.error = pageFailure(error, true);
  } finally {
    m.busy = m.saving = false;
    if (currentViewer(m)) render();
  }
};
A.saveBookmarkPage = async () => {
  const m = S.ui.modals.at(-1);
  if (m?.type !== 'bookmarkViewer' || m.busy || S.ui.currentUser?.role === 'viewer') return;
  m.busy = m.saving = true;
  m.error = '';
  render();
  try {
    const result = await bookmarkPageRequest(`/${encodeURIComponent(m.id)}/snapshots`, { method: 'POST' });
    if (!currentViewer(m)) return;
    m.snapshots.unshift(result.snapshot);
    m.selected = result.snapshot.id;
    m.archiveView = 'html';
    m.page = result.page;
    // The durable save already succeeded. A failed refresh must not tell the
    // user the copy was lost or cause a duplicate save on retry.
    await refreshWorkspaceFromServer().catch(() => {});
    if (currentViewer(m)) toast(words('HTML archive saved. Previous versions are retained.', 'HTML-архив сохранён. Предыдущие версии не изменены.'));
  } catch (error) {
    if (currentViewer(m)) m.error = pageFailure(error, true);
  } finally {
    m.busy = m.saving = false;
    if (currentViewer(m)) render();
  }
};
