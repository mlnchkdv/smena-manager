import { getActiveWorkspace } from '../core/api.js';
import { S } from '../core/store.js';
import { esc, fmtTimestamp } from '../core/utils.js';
import { bookmarkReaderHtml } from './bookmark-reader.js';
import '../styles/pages/bookmark-archive.css';

export function bookmarkArchiveUrl(bookmarkId, snapshotId) {
  return `/api/bookmark-pages/${encodeURIComponent(bookmarkId)}/snapshots/${encodeURIComponent(snapshotId)}/document?workspace=${encodeURIComponent(getActiveWorkspace())}&account=${encodeURIComponent(S.ui.currentUser?.id || '')}`;
}
export function bookmarkArchiveView(m, russian) {
  const T = (en, ru) => (russian ? ru : en);
  const page = m.page;
  const html = page.format === 'html';
  const url = m.selected !== 'live' ? bookmarkArchiveUrl(m.id, m.selected) : '';
  const controls = html
    ? `<div class="bookmark-archive-actions"><div class="seg" role="group" aria-label="${T('Archive view', 'Вид архива')}"><button data-a="bookmarkArchiveView" data-value="html" aria-pressed="${m.archiveView !== 'text'}" class="${m.archiveView !== 'text' ? 'on' : ''}">${T('Saved HTML', 'Сохранённый HTML')}</button><button data-a="bookmarkArchiveView" data-value="text" aria-pressed="${m.archiveView === 'text'}" class="${m.archiveView === 'text' ? 'on' : ''}">${T('Text', 'Текст')}</button></div><a class="btn btn-secondary btn-sm" href="${esc(url)}&download=1">${T('Download HTML', 'Скачать HTML')}</a></div>`
    : url
      ? `<a class="btn btn-secondary btn-sm" href="${esc(url)}&download=1">${T('Download text as HTML', 'Скачать текст в HTML')}</a>`
      : '';
  const capture = page.capture;
  const omitted = Object.entries(capture?.unsupported || {}).filter(([, count]) => count > 0);
  const names = {
    canvas: T('Canvas drawings', 'Рисунки canvas'),
    video: T('Videos', 'Видео'),
    audio: T('Audio', 'Аудио'),
    embeds: T('Embedded pages', 'Встроенные страницы'),
  };
  const report = omitted.length
    ? `<p class="hint bookmark-archive-warning">${T('Not preserved as interactive content: ', 'Не сохранены как интерактивные элементы: ')}${omitted.map(([key, count]) => esc(names[key] || key) + ' — ' + Number(count)).join('; ')}. ${T('A video poster is kept when available.', 'Обложка видео сохранена, если доступна.')}</p>`
    : '';
  const status = html
    ? `<p class="hint ${capture?.missing ? 'bookmark-archive-warning' : ''}" role="status">${capture?.mode === 'rendered-html' ? T('Browser capture · 1280 × 900. ', 'Сохранено через браузер · 1280 × 900. ') : ''}${T('Resources saved: ', 'Сохранено ресурсов: ')}${Number(capture?.assets || 0)}${capture?.missing ? T('. Unavailable resources: ', '. Недоступно ресурсов: ') + Number(capture.missing) + T('. The appearance may be incomplete.', '. Оформление может быть неполным.') : ''}</p>${capture?.scriptsDisabled ? `<p class="hint">${capture?.mode === 'rendered-html' ? T('Public content rendered at capture time. Interactive scripts are disabled in this copy.', 'Публичное содержимое сформировано браузером при архивации. Интерактивные скрипты в копии отключены.') : T('Interactive scripts are disabled. Content added by JavaScript may be absent from this archive.', 'Интерактивные скрипты отключены. Содержимое, добавляемое JavaScript, может отсутствовать в архиве.')}</p>` : ''}`
    : m.selected !== 'live'
      ? `<p class="hint">${T('This older copy contains text only. Save a new HTML archive to keep page styling and images.', 'Эта прежняя копия содержит только текст. Сохраните новый HTML-архив, чтобы сохранить оформление и изображения.')}</p>`
      : '';
  const body =
    html && m.archiveView !== 'text'
      ? m.documentState === 'ready'
        ? `<iframe class="bookmark-archive-frame" data-bookmark-archive-frame="${esc([m.generation, m.id, m.selected, russian ? 'ru' : 'en'].map(encodeURIComponent).join(':'))}" src="${esc(url)}" sandbox="" referrerpolicy="no-referrer" title="${T('Archived HTML page', 'Архивная HTML-страница')}"></iframe>`
        : m.documentState === 'error'
          ? `<div class="bookmark-page-notice" role="alert"><p>${esc(m.documentError)}</p><div class="bookmark-version-actions"><button class="btn btn-secondary" data-a="retryBookmarkDocument">${T('Retry HTML', 'Повторить HTML')}</button><button class="btn btn-ghost" data-a="bookmarkArchiveView" data-value="text">${T('Read saved text', 'Читать сохранённый текст')}</button></div><p class="hint">${T('You can also choose another saved version above.', 'Также можно выбрать другую сохранённую версию выше.')}</p></div>`
          : `<p role="status">${T('Checking saved HTML…', 'Проверяем сохранённый HTML…')}</p>`
      : `<article class="bookmark-page-reader">${bookmarkReaderHtml(page, m.id, russian)}</article>`;
  const width = html
    ? `<button class="btn btn-ghost btn-sm bookmark-archive-width" data-a="bookmarkArchiveWidth" aria-pressed="${!!m.wide}">${m.wide ? T('Standard width', 'Обычная ширина') : T('Expand viewer', 'Расширить просмотр')}</button>`
    : '';
  const offline =
    html && m.selected !== 'live'
      ? `<div class="bookmark-archive-actions"><button class="btn btn-ghost btn-sm" data-a="${m.offlineCopy ? 'removeBookmarkArchiveOffline' : 'keepBookmarkArchiveOffline'}" ${m.offlineBusy || m.documentState !== 'ready' ? 'disabled' : ''}>${m.offlineBusy ? T('Saving on this device…', 'Сохраняем на устройстве…') : m.offlineCopy ? T('Remove local archive', 'Убрать локальный архив') : T('Save this version offline', 'Сохранить эту версию офлайн')}</button>${m.offlineCopy ? `<span class="hint">${T('On this device: ', 'На устройстве: ')}${esc(fmtTimestamp(m.offlineCopy.savedAt))} · ${Math.ceil(m.offlineCopy.bytes / 1024)} KB · <a href="/offline.html" target="_blank" rel="noopener">${T('Open offline library', 'Открыть офлайн-библиотеку')}</a></span>` : ''}</div>`
      : '';
  return controls + body + `<div class="bookmark-archive-details">${width}${offline}${status}${report}</div>`;
}
