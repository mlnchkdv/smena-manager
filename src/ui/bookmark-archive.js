import { getActiveWorkspace } from '../core/api.js';
import { S } from '../core/store.js';
import { esc } from '../core/utils.js';
import { bookmarkReaderHtml } from './bookmark-reader.js';
import '../styles/pages/bookmark-archive.css';

export function bookmarkArchiveUrl(bookmarkId, snapshotId) {
  return `/api/bookmark-pages/${encodeURIComponent(bookmarkId)}/snapshots/${encodeURIComponent(snapshotId)}/document?workspace=${encodeURIComponent(getActiveWorkspace())}&account=${encodeURIComponent(S.ui.currentUser?.id || '')}`;
}
export function bookmarkArchiveView(m, russian) {
  const T = (en, ru) => (russian ? ru : en);
  const page = m.page;
  const html = page.format === 'html';
  const url = html ? bookmarkArchiveUrl(m.id, m.selected) : '';
  const controls = html
    ? `<div class="bookmark-archive-actions"><div class="seg" role="group" aria-label="${T('Archive view', 'Вид архива')}"><button data-a="bookmarkArchiveView" data-value="html" aria-pressed="${m.archiveView !== 'text'}" class="${m.archiveView !== 'text' ? 'on' : ''}">${T('Saved HTML', 'Сохранённый HTML')}</button><button data-a="bookmarkArchiveView" data-value="text" aria-pressed="${m.archiveView === 'text'}" class="${m.archiveView === 'text' ? 'on' : ''}">${T('Text', 'Текст')}</button></div><a class="btn btn-secondary btn-sm" href="${esc(url)}&download=1">${T('Download HTML', 'Скачать HTML')}</a></div>`
    : '';
  const capture = page.capture;
  const status = html
    ? `<p class="hint ${capture?.missing ? 'bookmark-archive-warning' : ''}" role="status">${T('Resources saved: ', 'Сохранено ресурсов: ')}${Number(capture?.assets || 0)}${capture?.missing ? T('. Unavailable resources: ', '. Недоступно ресурсов: ') + Number(capture.missing) + T('. The appearance may be incomplete.', '. Оформление может быть неполным.') : ''}</p>${capture?.scriptsDisabled ? `<p class="hint">${T('Interactive scripts are disabled. Content added by JavaScript may be absent from this archive.', 'Интерактивные скрипты отключены. Содержимое, добавляемое JavaScript, может отсутствовать в архиве.')}</p>` : ''}`
    : m.selected !== 'live'
      ? `<p class="hint">${T('This older copy contains text only. Save a new HTML archive to keep page styling and images.', 'Эта прежняя копия содержит только текст. Сохраните новый HTML-архив, чтобы сохранить оформление и изображения.')}</p>`
      : '';
  const body =
    html && m.archiveView !== 'text'
      ? `<iframe class="bookmark-archive-frame" src="${esc(url)}" sandbox="" referrerpolicy="no-referrer" title="${T('Archived HTML page', 'Архивная HTML-страница')}"></iframe>`
      : `<article class="bookmark-page-reader">${bookmarkReaderHtml(page, m.id, russian)}</article>`;
  return controls + status + body;
}
