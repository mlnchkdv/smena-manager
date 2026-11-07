import { S } from './store.js';
import { searchKnowledgePage, getSessionGeneration, knowledgeCatalogMode } from './api.js';
import { workspaceDocumentSyncIsClean } from './workspace-sync.js';
import { render } from '../shell/render.js';
const states = new Map();
export function clearKnowledgeSearch(mode = 'knowledge') {
  for (const key of [...states.keys()].filter(key => key === mode || key.startsWith(mode + ':'))) {
    clearTimeout(states.get(key)?.timer);
    states.get(key)?.controller.abort();
    states.delete(key);
  }
}
export function knowledgeServerPage(options) {
  const mode = options.channel || options.mode || 'knowledge';
  if (!options.query?.trim()) {
    clearKnowledgeSearch(mode);
    return null;
  }
  if (S.ui.knowledgeDirty || S.ui.offline || !workspaceDocumentSyncIsClean('knowledge', S.data)) {
    clearKnowledgeSearch(mode);
    return knowledgeCatalogMode() ? { localOnly: true } : null;
  }
  const generation = getSessionGeneration(),
    owner = S.ui.currentUser?.id,
    revision = S.ui.documentRevisions.knowledge;
  const favorites = S.prefs.favorites || '[]';
  const key = JSON.stringify([generation, owner, S.ui.activeWorkspace, revision, favorites, options]);
  if (states.get(mode)?.key === key) return states.get(mode).result;
  clearKnowledgeSearch(mode);
  const state = { key, controller: new AbortController(), result: { pending: true, ids: [], total: null, start: options.offset || 0, hasMore: false } };
  states.set(mode, state);
  state.timer = setTimeout(async () => {
    const current = () =>
      states.get(mode) === state &&
      generation === getSessionGeneration() &&
      owner === S.ui.currentUser?.id &&
      revision === S.ui.documentRevisions.knowledge &&
      workspaceDocumentSyncIsClean('knowledge', S.data);
    try {
      const result = await searchKnowledgePage({ ...options, signal: state.controller.signal });
      if (!current()) return;
      if (result.revision !== revision || result.favorites !== favorites) state.result = { ...state.result, pending: false, error: true };
      else state.result = result;
    } catch {
      if (current()) state.result = { ...state.result, pending: false, error: true };
    }
    if (current()) render();
  }, 250);
  return state.result;
}
window.addEventListener('smena:upload-scope-change', () => {
  for (const mode of [...states.keys()]) clearKnowledgeSearch(mode);
});
window.addEventListener('smena:session-account-changed', () => {
  for (const mode of [...states.keys()]) clearKnowledgeSearch(mode);
});
