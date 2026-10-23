const known = new Set(['Save changes before loading another file page.', 'The workspace changed. Retry loading files.']);
export function catalogLoadError(error) {
  if (known.has(error?.message)) return error.message;
  if (error?.code === 'REVISION_CONFLICT') return 'The workspace changed. Retry loading files.';
  if (error?.status === 401 || error?.code === 'AUTH_REQUIRED') return 'Sign in again to load files.';
  if (error?.status === 403) return 'Access to these files is unavailable.';
  if (error?.status === 413 || error?.code === 'WORKSPACE_TOO_LARGE') return 'The file catalog is too large to load.';
  return 'Unable to load files. Check connection and retry.';
}
