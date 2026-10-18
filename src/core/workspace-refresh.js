export const ACTIVE_REFRESH_MS = 5_000;
export const HIDDEN_REFRESH_MS = 30_000;
export const MAX_FAILURE_REFRESH_MS = 60_000;

export function pollConnectionFlags(syncState = {}) {
  const errors = Object.values(syncState.errors || {});
  return { offline: errors.includes('offline'), syncUnavailable: errors.includes('unavailable') };
}

export function workspaceRefreshDelay({ hidden = false, offline = false, failures = 0 } = {}) {
  if (hidden || offline) return HIDDEN_REFRESH_MS;
  return Math.min(ACTIVE_REFRESH_MS * 2 ** Math.max(0, failures), MAX_FAILURE_REFRESH_MS);
}
