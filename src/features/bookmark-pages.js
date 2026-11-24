import { rememberBookmarkDraft } from '../core/device-drafts.js';
import { S, D } from '../core/store.js';
import { bookmarkPageRequest, getSessionGeneration, getActiveWorkspace } from '../core/api.js';
import { offlineItems, putOffline, removeOffline } from '../core/offline-library.js';
import { isRussian } from '../core/i18n.js';
import { normalizedPageUrl, applyBookmarkMetadata } from '../shared/bookmark-metadata.js';
import { A, IN } from '../actions/actions.js';
import { openModal } from '../overlays/modals.js';
import { render } from '../shell/render.js';
import { esc, fmtTimestamp } from '../core/utils.js';
import { refreshWorkspaceFromServer } from '../core/bootstrap.js';
import { toast } from '../ui/toast.js';
import { disclosureAttributes } from '../ui/disclosure.js';
import { bookmarkArchiveView, bookmarkArchiveUrl } from '../ui/bookmark-archive.js';

const words = (en, ru) => (isRussian() ? ru : en);
let timer, controller;
function status(text) {
  const field = document.querySelector('[data-bookmark-metadata-status]');
  if (field) field.textContent = text;
}
export function scheduleBookmarkMetadata() {
  const draft = S.ui.bookmarkDraft;
  if (draft.pageAutofillUrl !== normalizedPageUrl(draft.url || '')) {
    for (const [key, value] of Object.entries(draft.pageAutofill || {})) {
      if (draft[key] !== value) continue;
      draft[key] = '';
      const field = document.getElementById('bookmark-' + key);
      if (field) field.value = '';
    }
    draft.pageAutofill = {};
  }
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
    draft.pageAutofillUrl = url;
    rememberBookmarkDraft();
    for (const key of keys) {
      const input = document.getElementById(`bookmark-${key}`);
      if (input) input.value = draft[key];
    }
    status(
      keys.length
        ? words('Page details added. You can edit them.', 'Сведения добавлены. Их можно изменить.')
        : words('No new details to fill in.', 'Новых сведений для заполнения нет.'),
    );
  } catch {
    if (!current.signal.aborted && S.ui.bookmarkForm && S.ui.bookmarkDraft === draft)
      status(words('Could not get page details. Fill in the fields manually or retry.', 'Не удалось получить сведения. Заполните поля вручную или повторите.'));
  }
}
A.bookmarkMetadata = loadBookmarkMetadata;

const currentViewer = m => S.ui.modals.includes(m) && m.generation === getSessionGeneration();
function pageFailure(error, saving = false) {
  if (error.code === 'PAGE_BOOKMARK_CHANGED')
    return words('The bookmark address changed. Reopen the bookmark and try again.', 'Адрес закладки изменился. Откройте закладку заново и повторите.');
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
  const selected = m.snapshots.find(ref => ref.id === m.selected);
  const title = m.selected === 'live' ? m.page?.title || m.title : m.page?.title || selected?.title || m.title;
  const source = m.selected === 'live' ? m.url : normalizedPageUrl(m.page?.url || selected?.finalUrl || selected?.sourceUrl || '') || m.url;
  const active = m.snapshots.filter(ref => !ref.isArchived);
  const versionOptions = m.snapshots
    .filter(ref => !ref.isArchived || ref.id === m.selected)
    .map(
      ref =>
        `<option value="${esc(ref.id)}" ${m.selected === ref.id ? 'selected' : ''}>${ref.format === 'html' ? words('HTML archive', 'HTML-архив') : words('Text copy', 'Текстовая копия')} · ${esc(fmtTimestamp(ref.capturedAt))}</option>`,
    )
    .join('');
  const captureTools =
    S.ui.currentUser?.role !== 'viewer'
      ? `<details class="bookmark-page-notice" ${disclosureAttributes('bookmark:capture:' + m.id)}><summary>${words('Capture settings', 'Настройки архивации')}</summary><label class="field">${words('Capture mode', 'Способ архивации')}<select class="select" data-in="bookmarkCaptureMode" ${m.job || m.submitting ? 'disabled' : ''}><option value="static" ${m.captureMode !== 'rendered' ? 'selected' : ''}>${words('Fast HTML', 'Быстрый HTML')}</option><option value="rendered" ${m.captureMode === 'rendered' ? 'selected' : ''}>${words('Browser · dynamic page', 'Браузер · динамическая страница')}</option></select></label><p class="hint">${words('Use browser capture for public content added by JavaScript. Saved copies keep styling and resources with interactive scripts disabled.', 'Режим «Браузер» сохраняет публичное содержимое, добавленное JavaScript. Копии сохраняют оформление и ресурсы с отключёнными скриптами.')}</p></details>`
      : '';
  const archiveButton = captureTools
    ? active.length >= 10
      ? `<button class="btn btn-secondary" data-a="manageBookmarkVersions">${words('Manage copies · 10/10', 'Управление копиями · 10/10')}</button>`
      : `<button class="btn btn-secondary" data-a="saveBookmarkPage" ${m.submitting || m.saving || m.job ? 'disabled' : ''}>${m.submitting ? words('Starting capture…', 'Запускаем архивацию…') : words('Archive page', 'Архивировать страницу')}</button>`
    : '';
  return `${H(words('Bookmark viewer', 'Просмотр закладки'))}<div class="modal-b" data-keep="bookmark-viewer:${esc(m.id)}:${esc(m.selected)}" translate="no">
    <div class="bookmark-viewer-heading" ${m.wide ? 'data-archive-wide' : ''}><h3 class="bookmark-viewer-title">${esc(title)}</h3><p class="hint bookmark-viewer-url" title="${esc(source)}">${esc(source)}</p></div>
    <div class="bookmark-viewer-toolbar"><label class="field">${words('Page version', 'Версия страницы')}<select class="select" data-in="bookmarkSnapshot" ${m.busy ? 'disabled' : ''}><option value="live" ${m.selected === 'live' ? 'selected' : ''}>${words('Current website', 'Сейчас на сайте')}</option>${versionOptions}</select></label>${m.selected === 'live' && active[0] ? `<button class="btn btn-secondary" data-a="openBookmarkCopy" data-id="${esc(active[0].id)}" ${m.busy ? 'disabled' : ''}>${words('Open saved copy', 'Открыть сохранённую копию')} · ${esc(fmtTimestamp(active[0].capturedAt))}</button>` : ''}${archiveButton}<a class="btn btn-ghost" href="${esc(source)}" target="_blank" rel="noopener noreferrer" aria-label="${words('Open original', 'Открыть оригинал')}">${words('Original', 'Оригинал')}</a></div>
    ${m.job ? `<p role="status">${archiveStage(m.job.phase)} ${words('You can close this window; capture continues on the server.', 'Можно закрыть окно: архивация продолжится на сервере.')}</p>` : ''}
    ${m.downloading ? `<p role="status">${words('Downloading HTML…', 'Скачиваем HTML…')}</p>` : ''}
    ${m.downloadError ? `<div role="alert"><p>${words('Could not download the selected copy.', 'Не удалось скачать выбранную копию.')}</p><button class="btn btn-secondary" data-a="downloadBookmarkArchive" data-id="${esc(m.downloadError)}">${words('Retry download', 'Повторить скачивание')}</button></div>` : ''}
    ${m.archiveError ? `<p class="err" role="alert">${esc(m.archiveError)}</p>` : ''}
    ${m.busy && !m.page ? `<p role="status">${words('Loading page…', 'Загружаем страницу…')}</p>` : ''}${m.error ? `<p class="err" role="alert">${esc(m.error)}</p><button class="btn btn-secondary" data-a="reloadBookmarkPage">${words('Reload preview', 'Перезагрузить просмотр')}</button>` : ''}
    ${m.page ? `<p class="hint bookmark-preview-status">${m.selected === 'live' ? words('Text preview of the current website', 'Текстовый просмотр текущей страницы') : words('Saved copy', 'Сохранённая копия')} · ${esc(fmtTimestamp(m.page.capturedAt))}</p>${bookmarkArchiveView(m, isRussian())}` : ''}
    ${captureTools}
    ${bookmarkVersionManager(m, active)}
    ${m.description || m.tags?.length || title !== m.title || source !== m.url ? `<details class="bookmark-page-notice" ${disclosureAttributes('bookmark:details:' + m.id)}><summary>${words('Bookmark details', 'Описание закладки')}</summary>${title !== m.title ? `<p class="hint">${esc(m.title)}</p>` : ''}${source !== m.url ? `<p class="hint bookmark-viewer-url">${words('Current bookmark URL: ', 'Текущий адрес закладки: ')}${esc(m.url)}</p>` : ''}${m.description ? `<p>${esc(m.description)}</p>` : ''}${m.tags?.length ? `<p>${m.tags.map(tag => '#' + esc(tag)).join(' · ')}</p>` : ''}</details>` : ''}
    </div>`;
}
function bookmarkVersionManager(m, active) {
  if (!m.snapshots.length) return '';
  const key = 'bookmark:copies:' + m.id;
  return `<details class="bookmark-version-manager" ${disclosureAttributes(key)}><summary>${words('Manage saved copies', 'Управление копиями')} · ${active.length}/10</summary><p class="hint">${words('Up to 10 copies can stay in the version selector. Move a copy out of the list to free a slot and keep the file.', 'В списке версий может быть до 10 копий. Уберите копию из активных, чтобы освободить место и сохранить файл.')}</p><ul>${m.snapshots.map(ref => `<li><div><strong>${esc(fmtTimestamp(ref.capturedAt))} · ${ref.format === 'html' ? 'HTML' : words('Text', 'Текст')}</strong><span class="hint bookmark-viewer-url">${esc(ref.finalUrl || ref.sourceUrl || m.url)}</span>${ref.isArchived ? `<span class="badge">${words('Stored version', 'Сохранённая версия')}</span>` : ''}</div><div class="bookmark-version-actions"><button class="btn btn-ghost btn-sm" data-a="openBookmarkCopy" data-id="${esc(ref.id)}" ${m.busy ? 'disabled' : ''}>${words('View', 'Открыть')}</button><button class="btn btn-ghost btn-sm" data-a="downloadBookmarkArchive" data-id="${esc(ref.id)}">${words('Download HTML', 'Скачать HTML')}</button>${S.ui.currentUser?.role !== 'viewer' ? `<button class="btn btn-secondary btn-sm" data-a="storeBookmarkCopy" data-id="${esc(ref.id)}" data-archived="${!ref.isArchived}" ${m.busy || (ref.isArchived && active.length >= 10) ? 'disabled' : ''}>${ref.isArchived ? words('Restore', 'Вернуть') : words('Store version', 'Убрать из активных')}</button>` : ''}</div></li>`).join('')}</ul></details>`;
}
A.downloadBookmarkArchive = async el => {
  const m = S.ui.modals.at(-1);
  const id = el.dataset.id;
  if (m?.type !== 'bookmarkViewer' || !m.snapshots.some(ref => ref.id === id) || m.downloading) return;
  const selection = m.selected;
  m.downloading = id;
  m.downloadError = null;
  render();
  try {
    const response = await fetch(bookmarkArchiveUrl(m.id, id) + '&download=1', { credentials: 'same-origin' });
    if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) throw new Error('Download failed');
    const blob = await response.blob();
    if (!currentViewer(m)) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (m.snapshots.find(ref => ref.id === id)?.title || m.title || 'archive') + '.html';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  } catch {
    if (m.selected === selection) m.downloadError = id;
  } finally {
    m.downloading = null;
    if (currentViewer(m)) render();
  }
};
A.manageBookmarkVersions = el => {
  const details = el.closest('.modal-b')?.querySelector('.bookmark-version-manager');
  const heading = details?.querySelector('summary');
  if (!heading) return;
  details.open = true;
  heading.focus({ preventScroll: true });
  heading.scrollIntoView({ block: 'nearest' });
};
A.bookmarkArchiveView = el => {
  const m = S.ui.modals.at(-1);
  if (m?.type === 'bookmarkViewer' && !m.busy) {
    m.archiveView = el.dataset.value === 'text' ? 'text' : 'html';
    render();
  }
};
IN.bookmarkCaptureMode = el => {
  const m = S.ui.modals.at(-1);
  if (m?.type === 'bookmarkViewer' && !m.job && !m.submitting) m.captureMode = el.value === 'rendered' ? 'rendered' : 'static';
};
A.bookmarkArchiveWidth = () => {
  const m = S.ui.modals.at(-1);
  if (m?.type === 'bookmarkViewer') {
    m.wide = !m.wide;
    render();
  }
};
async function loadPage(m) {
  m.downloadError = null;
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
    const offlineCopy = (await offlineItems(S.ui.currentUser?.id).catch(() => [])).find(
      item => item.workspace === getActiveWorkspace() && item.kind === 'bookmark-archive' && item.id === selected,
    );
    if (current() && offlineCopy) {
      m.offlineCopy = offlineCopy;
      render();
    }
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
  await Promise.all([loadPage(m), watchArchive(m)]);
  if (el.dataset.capture && currentViewer(m) && !m.snapshots.length) await A.saveBookmarkPage();
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
  if (m?.type !== 'bookmarkViewer' || m.busy || m.submitting || S.ui.currentUser?.role === 'viewer') return;
  m.saving = true;
  m.archiveError = '';
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
    if (currentViewer(m)) m.archiveError = pageFailure(error, true);
  } finally {
    m.saving = false;
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
      m.archiveError = '';
      await loadPage(m);
      await refreshWorkspaceFromServer().catch(() => {});
    } else if (job?.phase === 'failed') {
      m.archiveError = pageFailure({ code: job.code }, true);
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
  if (m?.type !== 'bookmarkViewer' || m.saving || m.submitting || m.job || S.ui.currentUser?.role === 'viewer') return;
  m.submitting = true;
  m.archiveError = '';
  m.requestKey ||= crypto.randomUUID();
  render();
  try {
    const { job } = await bookmarkPageRequest(`/${encodeURIComponent(m.id)}/archive-jobs`, {
      method: 'POST',
      body: JSON.stringify({ key: m.requestKey, mode: m.captureMode || 'static' }),
    });
    if (currentViewer(m)) m.job = job;
  } catch (error) {
    if (currentViewer(m)) {
      m.archiveError = pageFailure(error, true);
      if (error.status >= 400 && error.status < 500) m.requestKey = null;
    }
  } finally {
    m.submitting = false;
    if (currentViewer(m)) {
      render();
      await watchArchive(m);
    }
  }
};
for (const field of ['bookmarkArchiveFilter', 'bookmarkCapturedAfter', 'bookmarkArchiveSort'])
  IN[field] = el => {
    S.ui[field] = el.value;
    const filters = el.closest('details.collection-options');
    if (filters) filters.open = true;
    render();
  };
IN.bookmarkArchiveSearchQuery = el => {
  const m = S.ui.modals.at(-1);
  if (m?.type !== 'bookmarkArchiveSearch') return;
  m.query = el.value;
  const next = el.closest('.modal')?.querySelector('[data-more="true"]');
  if (next) next.disabled = m.busy || m.searched !== m.query.trim();
};
function archiveSearchDialog(m, heading) {
  const title = words('Search saved pages', 'Поиск по сохранённым страницам');
  const progress = m.busy
    ? words('Searching…', 'Ищем…')
    : m.scanned == null
      ? ''
      : `${words('Versions checked: ', 'Проверено версий: ')}${m.scanned}/${m.total}${m.unavailable ? ` · ${words('Unavailable: ', 'Недоступно: ')}${m.unavailable}` : ''}`;
  const results = m.results.map(
    row =>
      `<li><button class="btn btn-ghost" data-a="viewBookmarkPage" data-id="${esc(row.bookmarkId)}" data-snapshot="${esc(row.snapshotId)}">${esc(row.title)} · ${esc(fmtTimestamp(row.capturedAt))}</button><p>${esc(row.excerpt)}</p></li>`,
  );
  const empty = !m.busy && !m.error && m.scanned != null && !results.length && m.cursor == null;
  const pager = m.changed
    ? `<button id="bookmark-archive-search-page" class="btn btn-secondary" data-a="runBookmarkArchiveSearch" data-restart="true">${words('Restart search', 'Начать поиск заново')}</button>`
    : m.cursor != null
      ? `<button id="bookmark-archive-search-page" class="btn btn-secondary" data-a="runBookmarkArchiveSearch" data-more="true" ${m.busy || m.searched !== m.query.trim() ? 'disabled' : ''}>${words('Check next versions', 'Проверить следующие версии')}</button>`
      : '';
  return `${heading(title)}<div class="modal-b" data-keep="bookmark-archive-search" translate="no">
    <form data-submit="runBookmarkArchiveSearch" class="bookmark-archive-search-form"><label class="field">${words('Words in saved pages', 'Слова в сохранённых страницах')}<input id="bookmark-archive-search-query" class="input" type="search" data-in="bookmarkArchiveSearchQuery" value="${esc(m.query)}" maxlength="200" ${m.busy ? 'readonly' : ''}></label><button class="btn btn-primary" ${m.busy ? 'disabled' : ''}>${words('Search', 'Найти')}</button></form>
    <p class="hint">${words('Searches the text in saved copies, including versions removed from the active list.', 'Поиск по тексту сохранённых копий, включая версии, убранные из активных.')}</p>
    ${results.length ? `<ul class="bookmark-archive-search-results">${results.join('')}</ul>` : ''}
    ${empty ? `<p>${words('No matching saved pages.', 'Совпадений в сохранённых страницах нет.')}</p>` : ''}
  </div>${
    progress || pager || m.error
      ? `<div class="modal-f bookmark-archive-search-footer" translate="no">
    ${m.error ? `<p role="alert">${esc(m.error)}</p>` : ''}
    <span id="bookmark-archive-search-progress" role="status" tabindex="-1">${progress}</span>${pager}
  </div>`
      : ''
  }`;
}
A.searchBookmarkArchives = () =>
  openModal({
    type: 'bookmarkArchiveSearch',
    query: S.ui.bookmarkQuery || '',
    results: [],
    generation: getSessionGeneration(),
    onClose() {
      this.controller?.abort();
    },
    render: archiveSearchDialog,
  });
A.runBookmarkArchiveSearch = async el => {
  const m = S.ui.modals.at(-1);
  if (m?.type !== 'bookmarkArchiveSearch' || m.busy) return;
  const query = m.query.trim();
  if (query.length < 2) {
    m.error = words('Enter at least two characters.', 'Введите не менее двух символов.');
    render();
    return;
  }
  const more = el.dataset.more === 'true' && m.searched === query && m.cursor != null;
  if (!more) {
    m.results = [];
    m.unavailable = 0;
    m.scanned = m.total = m.cursor = null;
  }
  m.controller = new AbortController();
  m.busy = true;
  m.error = '';
  m.changed = false;
  render();
  if (!more) {
    const input = document.getElementById('bookmark-archive-search-query');
    if (input) input.closest('.modal-b').scrollTop = 0;
    if (el.dataset.restart === 'true') input?.focus({ preventScroll: true });
  } else {
    document.getElementById('bookmark-archive-search-progress')?.focus({ preventScroll: true });
  }
  try {
    const result = await bookmarkPageRequest('/search', {
      method: 'POST',
      signal: m.controller.signal,
      body: JSON.stringify({ query, ...(more ? { cursor: m.cursor, collectionVersion: m.collectionVersion } : {}) }),
    });
    if (!currentViewer(m)) return;
    m.results.push(...result.matches);
    m.searched = query;
    m.scanned = result.scanned;
    m.total = result.total;
    m.cursor = result.cursor;
    m.collectionVersion = result.collectionVersion;
    m.unavailable += result.unavailable;
  } catch (error) {
    if (!currentViewer(m)) return;
    if (error.code === 'PAGE_SEARCH_CHANGED') {
      m.results = [];
      m.scanned = m.total = m.cursor = null;
      m.unavailable = 0;
      m.changed = true;
      m.error = words('Saved copies changed during the search.', 'Сохранённые копии изменились во время поиска.');
    } else m.error = words('Search unavailable. Check the connection and retry.', 'Поиск недоступен. Проверьте соединение и повторите.');
  } finally {
    m.busy = false;
    if (currentViewer(m)) {
      const pagerFocused = document.activeElement?.id === 'bookmark-archive-search-progress';
      render();
      if (pagerFocused) document.getElementById('bookmark-archive-search-page')?.focus({ preventScroll: true });
    }
  }
};
