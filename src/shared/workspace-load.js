// Independent authenticated reads start together. The caller must fence the
// session before applying this bundle; only upload policy is optional.
export async function loadWorkspaceResources(api) {
  const [snapshot, knowledge, bookmarks, personal, filePolicy] = await Promise.all([
    api.getWorkspace(),
    api.getWorkspaceDocument('knowledge'),
    api.getWorkspaceDocument('bookmarks'),
    api.getPersonalPreferences(),
    api.getFileUploadPolicy().catch(() => null),
  ]);
  return { snapshot, documentSnapshots: { knowledge, bookmarks }, personal, filePolicy };
}
