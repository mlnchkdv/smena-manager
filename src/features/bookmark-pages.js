import { S, D } from '../core/store.js';
import { bookmarkPageRequest, getSessionGeneration, getActiveWorkspace } from '../core/api.js';
import { offlineItems, putOffline, removeOffline } from '../core/offline-library.js';
import { isRussian } from '../core/i18n.js';
import { normalizedPageUrl, applyBookmarkMetadata } from '../shared/bookmark-metadata.js';
import { A, IN } from '../actions/actions.js';
import { openModal } from '../overlays/modals.js';
import { render } from '../shell/render.js';
import { esc } from '../core/utils.js';
import { refreshWorkspaceFromServer } from '../core/bootstrap.js';
import { toast } from '../ui/toast.js';
import { disclosureAttributes, disclosureOpen } from '../ui/disclosure.js';
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
  if (['PAGE_RENDER_UNAVAILABLE', 'PAGE_RENDER_SANDBOX', 'PAGE_RENDER_BROWSER_MISSING', 'PAGE_RENDER_DEPENDENCIES'].includes(error.code))
    return words(
      'Browser capture is unavailable. Try the fast HTML mode or ask an administrator to check the capture worker.',
      'Сохранение через браузер недоступно. Попробуйте быстрый HTML-режим или попросите администратора проверить обработчик архивации.',
    );
  if (['PAGE_QUEUE_FULL', 'PAGE_RENDER_BUSY'].includes(error.code))
    return words(
      'Archive workers are busy. Wait for an existing capture and retry.',
      'Обработчики архивации заняты. Дождитесь завершения текущей копии и повторите.',
    );
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
  const title = m.selected === 'live' ? m.page?.title || m.title : m.page?.title || selected?.title || m.title;
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
      ? `<label class="field">${words('Capture mode', 'Способ архивации')}<select class="select" data-in="bookmarkCaptureMode" ${m.job ? 'disabled' : ''}><option value="static" ${m.captureMode !== 'rendered' ? 'selected' : ''}>${words('Fast HTML', 'Быстрый HTML')}</option><option value="rendered" ${m.captureMode === 'rendered' ? 'selected' : ''}>${words('Browser · dynamic page', 'Браузер · динамическая страница')}</option></select></label><button class="btn btn-secondary" data-a="saveBookmarkPage" ${m.busy || m.job || active.length >= 10 ? 'disabled' : ''}>${words('Archive page', 'Архивировать страницу')}</button>`
      : '';
  return `${H(words('Bookmark viewer', 'Просмотр закладки'))}<div class="modal-b" translate="no">
    <div class="bookmark-viewer-heading" ${m.wide ? 'data-archive-wide' : ''}><h3 class="bookmark-viewer-title" title="${esc(title)}">${esc(title)}</h3>${title !== m.title ? `<p class="hint">${words('Bookmark: ', 'Закладка: ')}${esc(m.title)}</p>` : ''}<p class="hint bookmark-viewer-url" title="${esc(source)}">${esc(source)}</p>${source !== m.url ? `<p class="hint bookmark-viewer-url">${words('Current bookmark URL: ', 'Текущий адрес закладки: ')}${esc(m.url)}</p>` : ''}</div>
    ${m.description || m.tags?.length ? `<details class="bookmark-page-notice" ${disclosureAttributes('bookmark:details:' + m.id)}><summary>${words('Bookmark details', 'Описание закладки')}</summary>${m.description ? `<p translate="no">${esc(m.description)}</p>` : ''}${m.tags?.length ? `<p translate="no">${m.tags.map(tag => '#' + esc(tag)).join(' · ')}</p>` : ''}</details>` : ''}
    <div class="bookmark-viewer-toolbar"><label class="field">${words('Page version', 'Версия страницы')}<select class="select" data-in="bookmarkSnapshot" ${m.busy ? 'disabled' : ''}><option value="live" ${m.selected === 'live' ? 'selected' : ''}>${words('Current website', 'Сейчас на сайте')}</option>${versionOptions}</select></label>${archiveButton}<a class="btn btn-ghost" href="${esc(source)}" target="_blank" rel="noopener noreferrer" aria-label="${words('Open original', 'Открыть оригинал')}">${words('Original', 'Оригинал')}</a></div>
    ${m.snapshots.length ? `<details class="bookmark-version-manager" data-ui-disclosure="bookmark:copies:${esc(m.id)}" ${active.length >= 10 || disclosureOpen('bookmark:copies:' + m.id) ? 'open' : ''}><summary>${words('Manage saved copies', 'Управление копиями')} · ${active.length}/10</summary><p class="hint">${words('Stored versions remain readable and recoverable. Moving them out of the active list frees a slot without deleting the file.', 'Сохранённые версии доступны для просмотра и восстановления. Перенос из активного списка освобождает место без удаления файла.')}</p><ul>${m.snapshots.map(ref => `<li><div><strong>${esc(stamp(ref.capturedAt))} · ${ref.format === 'html' ? 'HTML' : words('Text', 'Текст')}</strong><span class="hint bookmark-viewer-url">${esc(ref.finalUrl || ref.sourceUrl || m.url)}</span>${ref.isArchived ? `<span class="badge">${words('Stored version', 'Сохранённая версия')}</span>` : ''}</div><div class="bookmark-version-actions"><button class="btn btn-ghost btn-sm" data-a="openBookmarkCopy" data-id="${esc(ref.id)}" ${m.busy ? 'disabled' : ''}>${words('View', 'Открыть')}</button><a class="btn btn-ghost btn-sm" href="${esc(bookmarkArchiveUrl(m.id, ref.id))}&download=1">${ref.format === 'html' ? 'HTML' : words('Text', 'Текст')} ↓</a>${S.ui.currentUser?.role !== 'viewer' ? `<button class="btn btn-secondary btn-sm" data-a="storeBookmarkCopy" data-id="${esc(ref.id)}" data-archived="${!ref.isArchived}" ${m.busy || (ref.isArchived && active.length >= 10) ? 'disabled' : ''}>${ref.isArchived ? words('Restore', 'Вернуть') : words('Store version', 'Убрать из активных')}</button>` : ''}</div></li>`).join('')}</ul></details>` : ''}
    <details class="bookmark-page-notice"><summary>${words('About HTML archives', 'Об HTML-архивах')}</summary><p class="hint">${words('Archives keep the public HTML, CSS, images and fonts downloaded at capture time. Scripts and embedded pages are disabled. JavaScript-only or sign-in content may be absent; unavailable resources are reported. Up to 10 active copies per bookmark; stored versions are retained.', 'Архивы сохраняют публичный HTML, стили, изображения и шрифты, загруженные в момент архивации. Скрипты и встроенные страницы отключены. Содержимое, доступное только через JavaScript или после входа, может отсутствовать; недоступные ресурсы отмечаются. До 10 активных копий на закладку; сохранённые версии не удаляются.')}</p></details>
    ${m.job ? `<p role="status">${archiveStage(m.job.phase)} ${words('You can close this window; capture continues on the server.', 'Можно закрыть окно: архивация продолжится на сервере.')}</p>` : ''}
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
IN.bookmarkCaptureMode = el => {
  const m = S.ui.modals.at(-1);
  if (m?.type === 'bookmarkViewer' && !m.job) m.captureMode = el.value === 'rendered' ? 'rendered' : 'static';
};
A.bookmarkArchiveWidth = () => {
  const m = S.ui.modals.at(-1);
  if (m?.type === 'bookmarkViewer') {
    m.wide = !m.wide;
    render();
  }
};
async function loadPage(m) {
  m.controller?.abort();
  m.controller = new AbortController();
  const controller = m.controller;
  const selected = m.selected;
  const current = () => currentViewer(m) && m.controller === controller && m.selected === selected;
  m.busy = true;
  m.error = '';
  m.page = null;
  m.documentState = 'loading';
  m.document = '';
  m.offlineCopy = null;
  render();
  try {
    const path = `/${encodeURIComponent(m.id)}`;
    const options = { signal: controller.signal };
    const page = await bookmarkPageRequest(
      m.selected === 'live' ? path + '/preview' : path + '/snapshots/' + encodeURIComponent(m.selected),
      m.selected === 'live' ? { ...options, method: 'POST' } : options,
    );
    if (current()) m.page = page;
  } catch (error) {
    if (current() && !controller.signal.aborted) m.error = pageFailure(error);
  } finally {
    if (current()) {
      m.busy = false;
      render();
    }
  }
  if (current() && m.page?.format === 'html') await loadDocument(m, controller);
  if (current()) {
    m.offlineCopy = (await offlineItems(S.ui.currentUser?.id).catch(() => [])).find(
      item => item.workspace === getActiveWorkspace() && item.kind === 'bookmark-archive' && item.id === selected,
    );
    if (current()) render();
  }
}
async function loadDocument(m, controller = m.controller) {
  const selected = m.selected;
  const current = () => currentViewer(m) && m.controller === controller && m.selected === selected;
  m.documentState = 'loading';
  if (current()) render();
  try {
    const document = await bookmarkPageRequest(`/${encodeURIComponent(m.id)}/snapshots/${encodeURIComponent(selected)}/document`, {
      responseFormat: 'text',
      signal: controller.signal,
    });
    if (!/^<!doctype html>/iu.test(document) || !document.includes('Content-Security-Policy'))
      throw Object.assign(new Error('Invalid HTML'), { code: 'PAGE_SNAPSHOT_UNAVAILABLE' });
    if (current()) {
      m.document = document;
      m.documentState = 'ready';
    }
  } catch (error) {
    if (current() && !controller.signal.aborted) {
      m.documentState = 'error';
      m.documentError =
        error.status === 401
          ? words('Sign in again to load the saved HTML.', 'Войдите снова, чтобы загрузить сохранённый HTML.')
          : error.status === 403
            ? words(
                'Access to this archive has changed. Ask the workspace owner for access.',
                'Доступ к архиву изменился. Обратитесь к владельцу пространства.',
              )
            : words(
                'Saved HTML could not be loaded or verified. Retry, read the saved text or choose another version.',
                'Не удалось загрузить или проверить HTML. Повторите, прочитайте сохранённый текст или выберите другую версию.',
              );
    }
  }
  if (current()) render();
}
A.retryBookmarkDocument = () => {
  const m = S.ui.modals.at(-1);
  if (m?.type === 'bookmarkViewer' && m.page?.format === 'html') return loadDocument(m);
};
A.keepBookmarkArchiveOffline = async () => {
  const m = S.ui.modals.at(-1);
  if (m?.type !== 'bookmarkViewer' || m.documentState !== 'ready' || m.offlineBusy) return;
  const owner = S.ui.currentUser.id,
    workspace = getActiveWorkspace(),
    selected = m.selected;
  const localCopy = { workspaceName: D().ws.name, bookmarkId: m.id, title: m.page.title || m.title, capturedAt: m.page.capturedAt, document: m.document };
  m.offlineBusy = true;
  render();
  try {
    const { ensureOfflineShell } = await import('./offline-knowledge.js');
    await ensureOfflineShell(owner, m.generation);
    const item = await putOffline({
      owner,
      workspace,
      ...localCopy,
      kind: 'bookmark-archive',
      id: selected,
    });
    if (!currentViewer(m) || selected !== m.selected) return;
    m.offlineCopy = item;
    toast(words('Complete HTML archive saved on this device.', 'Полный HTML-архив сохранён на устройстве.'));
  } catch {
    toast(
      words(
        'Could not save locally. Check free storage. Limits: 20 MB per archive and 50 MB for the library.',
        'Не удалось сохранить на устройстве. Проверьте свободное место. Лимиты: 20 МБ на архив и 50 МБ на библиотеку.',
      ),
      { kind: 'err' },
    );
  } finally {
    m.offlineBusy = false;
    if (currentViewer(m)) render();
  }
};
A.removeBookmarkArchiveOffline = async () => {
  const m = S.ui.modals.at(-1);
  if (m?.type !== 'bookmarkViewer' || !m.offlineCopy) return;
  await removeOffline(m.offlineCopy);
  m.offlineCopy = null;
  if (currentViewer(m)) render();
};
A.viewBookmarkPage = async el => {
  const link = D().links?.find(row => row.id === el.dataset.id);
  if (!link || !normalizedPageUrl(link.url)) return;
  const m = {
    type: 'bookmarkViewer',
    id: link.id,
    title: link.title,
    description: link.description || '',
    tags: [...(link.tags || [])],
    url: link.url,
    snapshots: [...(link.pageSnapshots || [])],
    generation: getSessionGeneration(),
    render: viewer,
  };
  m.selected = m.snapshots.find(ref => ref.id === el.dataset.snapshot)?.id || m.snapshots.find(ref => !ref.isArchived)?.id || m.snapshots[0]?.id || 'live';
  m.onClose = () => {
    m.controller?.abort();
    clearTimeout(m.jobTimer);
  };
  m.beforeClose = () => {
    if (m.saving) {
      toast(words('Please wait for the page copy to finish saving.', 'Дождитесь сохранения копии страницы.'), { kind: 'info' });
      return false;
    }
    return true;
  };
  openModal(m);
  await loadPage(m);
  await watchArchive(m);
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
  return loadPage(m);
};
A.storeBookmarkCopy = async el => {
  const m = S.ui.modals.at(-1);
  if (m?.type !== 'bookmarkViewer' || m.busy || S.ui.currentUser?.role === 'viewer') return;
  m.busy = m.saving = true;
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
function archiveStage(phase) {
  return (
    {
      queued: words('Archive queued.', '\u0410\u0440\u0445\u0438\u0432\u0430\u0446\u0438\u044f \u0432 \u043e\u0447\u0435\u0440\u0435\u0434\u0438.'),
      fetching: words('Downloading page…', '\u0417\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u043c \u0441\u0442\u0440\u0430\u043d\u0438\u0446\u0443…'),
      resources: words(
        'Saving images and styles…',
        '\u0421\u043e\u0445\u0440\u0430\u043d\u044f\u0435\u043c \u0438\u0437\u043e\u0431\u0440\u0430\u0436\u0435\u043d\u0438\u044f \u0438 \u0441\u0442\u0438\u043b\u0438…',
      ),
      verifying: words('Verifying archive…', '\u041f\u0440\u043e\u0432\u0435\u0440\u044f\u0435\u043c \u0430\u0440\u0445\u0438\u0432…'),
    }[phase] || ''
  );
}
async function watchArchive(m) {
  clearTimeout(m.jobTimer);
  if (!currentViewer(m)) return;
  try {
    const { jobs } = await bookmarkPageRequest(`/${encodeURIComponent(m.id)}/archive-jobs`);
    if (!currentViewer(m)) return;
    const job = m.job
      ? jobs.find(row => row.id === m.job.id)
      : m.requestKey
        ? jobs.find(row => row.key === m.requestKey)
        : jobs.find(row => !['ready', 'failed'].includes(row.phase));
    m.job = job;
    if (job?.phase === 'ready') {
      if (!m.snapshots.some(row => row.id === job.snapshot.id)) m.snapshots.unshift(job.snapshot);
      m.selected = job.snapshot.id;
      m.job = null;
      m.archiveView = 'html';
      m.requestKey = null;
      await loadPage(m);
      await refreshWorkspaceFromServer().catch(() => {});
    } else if (job?.phase === 'failed') {
      m.error = pageFailure({ code: job.code }, true);
      m.job = null;
      m.requestKey = null;
    }
  } catch {
    // A disconnected tab does not cancel a server-side archive.
  }
  if (currentViewer(m)) {
    render();
    if (m.job) m.jobTimer = setTimeout(() => watchArchive(m), 4000);
  }
}
A.saveBookmarkPage = async () => {
  const m = S.ui.modals.at(-1);
  if (m?.type !== 'bookmarkViewer' || m.busy || m.job || S.ui.currentUser?.role === 'viewer') return;
  m.busy = true;
  m.error = '';
  m.requestKey ||= crypto.randomUUID();
  render();
  try {
    const { job } = await bookmarkPageRequest(`/${encodeURIComponent(m.id)}/archive-jobs`, {
      method: 'POST',
      body: JSON.stringify({ key: m.requestKey, mode: m.captureMode || 'static' }),
    });
    if (currentViewer(m)) m.job = job;
  } catch (error) {
    if (currentViewer(m)) m.error = pageFailure(error, true);
  } finally {
    m.busy = false;
    if (currentViewer(m)) {
      render();
      await watchArchive(m);
    }
  }
};
for (const field of ['bookmarkArchiveFilter', 'bookmarkCapturedAfter', 'bookmarkArchiveSort'])
  IN[field] = el => {
    S.ui[field] = el.value;
    render();
  };
IN.bookmarkArchiveSearchQuery = el => {
  const m = S.ui.modals.at(-1);
  if (m?.type === 'bookmarkArchiveSearch') m.query = el.value;
};
A.searchBookmarkArchives = () =>
  openModal({
    type: 'bookmarkArchiveSearch',
    query: S.ui.bookmarkQuery || '',
    results: [],
    generation: getSessionGeneration(),
    render: (m, H) =>
      `${H(words('Search saved pages', 'Поиск по сохранённым страницам'))}<div class="modal-b" translate="no"><label class="field">${words('Words in archived pages', 'Слова в сохранённых страницах')}<input class="input" data-in="bookmarkArchiveSearchQuery" value="${esc(m.query)}" maxlength="200" ${m.busy ? 'disabled' : ''}></label><p class="hint">${words('Searches saved versions, including stored copies. Checks 20 versions at a time without downloading page HTML to your device.', 'Поиск по версиям, включая убранные из активных. Проверяем по 20 версий, не загружая HTML страниц на устройство.')}</p><button class="btn btn-primary" data-a="runBookmarkArchiveSearch" ${m.busy ? 'disabled' : ''}>${words('Search', 'Найти')}</button>${m.busy ? `<p role="status">${words('Searching…', 'Ищем…')}</p>` : ''}${m.error ? `<p role="alert">${esc(m.error)}</p>` : ''}${m.scanned != null ? `<p role="status">${words('Versions checked: ', 'Проверено версий: ')}${m.scanned}/${m.total} · ${words('Unavailable: ', 'Недоступно: ')}${m.unavailable}</p>` : ''}<ul class="bookmark-archive-search-results">${m.results.map(row => `<li><button class="btn btn-ghost" data-a="viewBookmarkPage" data-id="${esc(row.bookmarkId)}" data-snapshot="${esc(row.snapshotId)}">${esc(row.title)} · ${esc(new Date(row.capturedAt).toLocaleString(isRussian() ? 'ru-RU' : 'en-US'))}</button><p>${esc(row.excerpt)}</p></li>`).join('')}</ul>${m.scanned != null && !m.results.length && m.cursor == null ? `<p>${words('No matching saved pages.', 'Совпадений в сохранённых страницах нет.')}</p>` : ''}${m.cursor != null ? `<button class="btn btn-secondary" data-a="runBookmarkArchiveSearch" data-more="true" ${m.busy ? 'disabled' : ''}>${words('Check next versions', 'Проверить следующие версии')}</button>` : ''}</div>`,
  });
A.runBookmarkArchiveSearch = async el => {
  const m = S.ui.modals.at(-1);
  if (m?.type !== 'bookmarkArchiveSearch' || m.busy) return;
  if (m.query.trim().length < 2) {
    m.error = words('Enter at least two characters.', 'Введите не менее двух символов.');
    render();
    return;
  }
  const more = el.dataset.more === 'true' && m.searched === m.query;
  if (!more) {
    m.results = [];
    m.unavailable = 0;
  }
  m.busy = true;
  m.error = '';
  render();
  try {
    const result = await bookmarkPageRequest('/search', { method: 'POST', body: JSON.stringify({ query: m.query, cursor: more ? m.cursor : 0 }) });
    if (!currentViewer(m)) return;
    m.results.push(...result.matches);
    m.searched = m.query;
    m.scanned = result.scanned;
    m.total = result.total;
    m.cursor = result.cursor;
    m.unavailable += result.unavailable;
  } catch {
    if (currentViewer(m)) m.error = words('Search unavailable. Check the connection and retry.', 'Поиск недоступен. Проверьте соединение и повторите.');
  } finally {
    m.busy = false;
    if (currentViewer(m)) render();
  }
};
