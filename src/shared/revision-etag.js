export function workspaceRevisionEtag(revision, updatedAt = '') {
  const value = `${Number(revision) || 0}:${String(updatedAt || '')}`;
  return `W/"${encodeURIComponent(value)}"`;
}
