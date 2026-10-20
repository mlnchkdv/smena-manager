import { S } from '../core/store.js';
import { workspaceSyncState } from '../core/workspace-sync.js';
import { t } from '../core/i18n.js';
export function knowledgeSaveLabel() {
  const state = workspaceSyncState().documents.knowledge;
  if (state.hasConflict) return 'Conflict';
  if (state.lastError || S.ui.offline) return 'Saved locally';
  if (state.hasPending || state.hasActive || S.ui.knowledgeDirty) return 'Saving…';
  return 'Saved';
}
export function updateKnowledgeSaveStatus() {
  document.querySelectorAll('[data-knowledge-save-status]').forEach(el => {
    el.textContent = t(knowledgeSaveLabel());
  });
}
if (typeof window !== 'undefined') {
  window.addEventListener('smena:sync-status', event => {
    if (event.detail.scope === 'knowledge' && event.detail.status === 'saved') S.ui.knowledgeDirty = false;
    updateKnowledgeSaveStatus();
  });
}
