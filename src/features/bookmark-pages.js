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
function pageFailure(error) {
  if (error.code === 'PAGE_SNAPSHOT_LIMIT')
    return words('This bookmark already has 10 saved copies. Existing copies are retained.', 'У закладки уже есть 10 копий. Все существующие копии сохранены.');
  if (error.code === 'PAGE_TOO_LARGE')
    return words('The page is too large to capture. Open the original website.', 'Страница слишком большая для копии. Откройте оригинал.');
  if (error.code === 'PAGE_RATE_LIMIT') return words('Too many requests. Wait a minute and retry.', 'Слишком много запросов. Повторите через минуту.');
  if (error.code === 'PAGE_SNAPSHOT_UNAVAILABLE')
    return words('This saved copy is unavailable or failed verification. Try another copy.', 'Эта копия недоступна или не прошла проверку. Выберите другую.');
  return words(
    'The website could not be read. It may require sign-in, block capture or be unavailable. Existing saved copies still work.',
    'Не удалось прочитать сайт. Возможно, нужен вход, сайт запрещает чтение или недоступен. Ранее сохранённые копии остаются доступны.',
  );
}
function viewer(m, H) {
  const stamp = value => new Date(value).toLocaleString(isRussian() ? 'ru-RU' : 'en-US');
  return `${H(words('Bookmark viewer', 'Просмотр закладки'))}<div class="modal-b" translate="no">
    <div class="bookmark-viewer-heading"><h3 class="bookmark-viewer-title">${esc(m.title)}</h3><p class="hint bookmark-viewer-url">${esc(m.url)}</p></div>
    <div class="bookmark-viewer-toolbar"><label class="field">${words('Page version', 'Версия страницы')}<select class="select" data-in="bookmarkSnapshot" ${m.busy ? 'disabled' : ''}><option value="live" ${m.selected === 'live' ? 'selected' : ''}>${words('Current website', 'Сейчас на сайте')}</option>${m.snapshots.map(ref => `<option value="${esc(ref.id)}" ${m.selected === ref.id ? 'selected' : ''}>${words('Saved', 'Копия от')} ${esc(stamp(ref.capturedAt))}</option>`).join('')}</select></label>${S.ui.currentUser?.role !== 'viewer' ? `<button class="btn btn-secondary" data-a="saveBookmarkPage" ${m.busy || m.snapshots.length >= 10 ? 'disabled' : ''}>${words('Save a new page copy', 'Сохранить новую копию')}</button>` : ''}<a class="btn btn-ghost" href="${esc(m.url)}" target="_blank" rel="noopener noreferrer">${words('Open original', 'Открыть оригинал')}</a></div>
    <details class="bookmark-page-notice"><summary>${words('About saved copies', 'О копиях страниц')}</summary><p class="hint">${words('A readable copy of public page text and tables. Scripts, images and interactive elements are excluded. Sign-in pages and content loaded by JavaScript may be incomplete. Up to 10 copies per bookmark; older copies are retained.', 'Читаемая копия текста и таблиц публичной страницы. Скрипты, изображения и интерактивные элементы исключены. Страницы со входом и содержимое, загружаемое JavaScript, могут быть неполными. До 10 копий на закладку; прежние копии сохраняются.')}</p></details>
    ${m.busy ? `<p role="status">${words('Loading page…', 'Загружаем страницу…')}</p>` : ''}${m.error ? `<p class="err" role="alert">${esc(m.error)}</p><button class="btn btn-secondary" data-a="reloadBookmarkPage">${words('Retry', 'Повторить')}</button>` : ''}
    ${m.page && !m.busy ? `<p class="hint" role="status">${m.selected === 'live' ? words('Preview only — not saved.', 'Предпросмотр — копия ещё не сохранена.') : words('Saved copy. Available even if the original changes or disappears.', 'Сохранённая копия. Доступна, даже если оригинал изменится или исчезнет.')} · ${esc(stamp(m.page.capturedAt))}</p><article class="bookmark-page-reader">${m.page.html}</article>` : ''}
    </div><div class="modal-f"><button class="btn btn-secondary" data-a="closeModal">${words('Close', 'Закрыть')}</button></div>`;
}
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
  m.selected = m.snapshots[0]?.id || 'live';
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
    m.page = result.page;
    // The durable save already succeeded. A failed refresh must not tell the
    // user the copy was lost or cause a duplicate save on retry.
    await refreshWorkspaceFromServer().catch(() => {});
    if (currentViewer(m)) toast(words('Page copy saved. Previous copies are retained.', 'Копия страницы сохранена. Предыдущие копии не изменены.'));
  } catch (error) {
    if (currentViewer(m)) m.error = pageFailure(error);
  } finally {
    m.busy = m.saving = false;
    if (currentViewer(m)) render();
  }
};
