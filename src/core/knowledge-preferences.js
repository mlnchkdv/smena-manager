import { D, S } from './store.js';
let loadedKey;
const key = () => `smena.knowledge.ui.v1:${S.ui.currentUser?.id || 'anonymous'}:${D().ws.id || D().ws.url}`;
export function knowledgePreferences() {
  const next = key();
  if (next !== loadedKey) {
    loadedKey = next;
    let value = {};
    try {
      value = JSON.parse(localStorage.getItem(next) || '{}');
    } catch {
      /* optional device preferences */
    }
    S.ui.knowledgeSavedViews = Array.isArray(value.views) ? value.views.slice(0, 20) : [];
    S.ui.knowledgeRecent = Array.isArray(value.recent) ? value.recent.slice(0, 50) : [];
  }
}
export function saveKnowledgePreferences() {
  try {
    localStorage.setItem(key(), JSON.stringify({ views: S.ui.knowledgeSavedViews || [], recent: S.ui.knowledgeRecent || [] }));
  } catch {
    /* optional device preferences */
  }
}
