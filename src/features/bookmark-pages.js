import { S } from '../core/store.js';
import { bookmarkPageRequest } from '../core/api.js';
import { isRussian } from '../core/i18n.js';
import { normalizedPageUrl, applyBookmarkMetadata } from '../shared/bookmark-metadata.js';
import { A } from '../actions/actions.js';

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
