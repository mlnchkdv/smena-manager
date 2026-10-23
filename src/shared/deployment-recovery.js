// Deliberately conservative: the upgrade must never discard an open form or transfer.
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
