const META_FIELDS = new Set(['schemaVersion', 'revision', 'createdAt', 'updatedAt', 'workspace']);

export function workspacePayload(snapshot) {
  return Object.fromEntries(Object.entries(snapshot || {}).filter(([key]) => !META_FIELDS.has(key)));
}

export function isEmptyWorkspace(snapshot) {
  return (
    Number(snapshot?.revision || 0) === 0 &&
    !snapshot?.ws &&
    !(snapshot?.members?.length || snapshot?.projects?.length || snapshot?.tasks?.length || snapshot?.comments?.length)
  );
}
