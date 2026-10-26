// Deliberately conservative: the upgrade must never discard an open form or transfer.
export function failedOverlayTarget(ui = {}) {
  if (!ui.overlayLoadFailed || ui.modals?.length || ui.pop || ui.knowledgeDirty) return null;
  if (ui.knowledgeDrawer && ui.knowledgeDrawerView === 'preview') return { kind: 'note', id: ui.knowledgeDrawer };
  if (ui.drawer && !ui.form) return { kind: 'task', id: ui.drawer };
  if (ui.palette) return { kind: 'search', query: String(ui.palette.q || '').slice(0, 500) };
  return null;
}

export function deploymentReloadSafe({ clean, sync = {}, personal = {}, uploads = [], transfer, forms, drafts, loading, authBusy }) {
  return Boolean(
    clean &&
    !sync.hasPending &&
    !sync.hasActive &&
    !sync.hasConflict &&
    !Object.keys(sync.errors || {}).length &&
    !personal.pending &&
    !['syncing', 'offline', 'unavailable', 'invalid'].includes(personal.status) &&
    !uploads.length &&
    !transfer &&
    !forms &&
    !drafts &&
    !loading &&
    !authBusy,
  );
}
