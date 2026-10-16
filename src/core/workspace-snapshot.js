const META_FIELDS = new Set(['schemaVersion', 'revision', 'createdAt', 'updatedAt', 'workspace']);

export function workspacePayload(snapshot) {
  return Object.fromEntries(Object.entries(snapshot || {}).filter(([key]) => !META_FIELDS.has(key)));
}

export function isEmptyWorkspace(snapshot) {
  const members = Array.isArray(snapshot?.members) ? snapshot.members : [];
  const onlyAuthorizedMembers = members.every(member => member?.authProfileId);
  const hasWorkspaceContent = [
    'workspaces',
    'projects',
    'tasks',
    'comments',
    'knowledgeNotes',
    'knowledgeFolders',
    'links',
    'linkFolders',
    'files',
    'activity',
    'notifs',
    'events',
    'projOrder',
    'savedViews',
  ].some(field => Array.isArray(snapshot?.[field]) && snapshot[field].length > 0);

  return !String(snapshot?.ws?.name || '').trim() && onlyAuthorizedMembers && !hasWorkspaceContent;
}
