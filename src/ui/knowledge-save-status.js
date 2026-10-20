import { S, D } from '../core/store.js';
import { workspaceDocumentData } from '../shared/workspace-documents.js';
import { workspaceSyncState } from '../core/workspace-sync.js';
import { t } from '../core/i18n.js';
export function knowledgeSaveLabel() {
  const state = workspaceSyncState().documents.knowledge;
  if (state.hasConflict) return 'Conflict';
  if (state.lastError || S.ui.offline) return 'Saved locally';
  if (state.hasPending || state.hasActive || S.ui.knowledgeDirty) return 'Saving…';
  return 'Saved';
}
export function knowledgeEditBlocked() {
  return workspaceSyncState().documents.knowledge.hasConflict || (S.ui.syncRecovery?.scope === 'knowledge' && S.ui.syncRecovery.owner === S.ui.currentUser?.id);
}
export function updateKnowledgeSaveStatus() {
  document.querySelectorAll('[data-knowledge-save-status]').forEach(el => {
    el.textContent = t(knowledgeSaveLabel());
  });
}
if (typeof window !== 'undefined') {
  window.addEventListener('smena:sync-status', event => {
    if (
      event.detail.scope === 'knowledge' &&
      event.detail.status === 'saved' &&
      JSON.stringify(workspaceDocumentData('knowledge', D())) === JSON.stringify(event.detail.sentData)
    )
      S.ui.knowledgeDirty = false;
    // The sync promise settles after its saved event has been dispatched.
    queueMicrotask(updateKnowledgeSaveStatus);
  });
}
