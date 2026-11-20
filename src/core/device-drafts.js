import { getActiveWorkspace } from './api.js';
import { S } from './store.js';

const memory = new Map();
const prefix = kind => 'smena.drafts.' + JSON.stringify([getActiveWorkspace(), S.ui.currentUser?.id, kind]) + ':';
const keyFor = (kind, id) => prefix(kind) + encodeURIComponent(id);
export function deviceDraft(kind, id) {
  const key = keyFor(kind, id);
  try {
    if (memory.has(key)) return memory.get(key);
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return memory.get(key);
  }
}
export function writeDeviceDraft(kind, id, value) {
  const key = keyFor(kind, id);
  try {
    if (value) localStorage.setItem(key, JSON.stringify(value));
    else localStorage.removeItem(key);
    memory.delete(key);
  } catch {
    memory.set(key, value || null);
  }
}
export function bookmarkDrafts() {
  const base = prefix('bookmark');
  const keys = new Set(memory.keys());
  try {
    for (const key of Object.keys(localStorage)) keys.add(key);
  } catch {
    /* Session only. */
  }
  return [...keys]
    .filter(key => key.startsWith(base))
    .map(key => {
      const id = decodeURIComponent(key.slice(base.length));
      return { id, draft: deviceDraft('bookmark', id) };
    })
    .filter(item => item.draft);
}
export function rememberBookmarkDraft() {
  if (S.ui.bookmarkForm) writeDeviceDraft('bookmark', S.ui.bookmarkEditing || '', S.ui.bookmarkDraft);
}
