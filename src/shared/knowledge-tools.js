export function folderTrail(id, folders) {
  const byId = new Map(folders.map(folder => [folder.id, folder]));
  const result = [];
  const seen = new Set();
  while (byId.has(id) && !seen.has(id)) {
    seen.add(id);
    const folder = byId.get(id);
    result.unshift(folder);
    id = folder.parentId;
  }
  return result;
}
export function folderDescendants(id, folders) {
  const children = new Map();
  for (const folder of folders) {
    if (!children.has(folder.parentId)) children.set(folder.parentId, []);
    children.get(folder.parentId).push(folder.id);
  }
  const result = new Set([id]),
    queue = [id];
  for (let index = 0; index < queue.length; index++)
    for (const child of children.get(queue[index]) || [])
      if (!result.has(child)) {
        result.add(child);
        queue.push(child);
      }
  return result;
}

export function moveKnowledgeFolder(folders, id, parentId) {
  const folder = folders.find(item => item.id === id);
  const parent = parentId || null;
  if (!folder || (parent && !folders.some(item => item.id === parent))) return false;
  if (folderTrail(parent, folders).some(item => item.id === id)) return false;
  if (
    folders.some(
      item => item.id !== id && (item.parentId || null) === parent && item.name.trim().toLocaleLowerCase() === folder.name.trim().toLocaleLowerCase(),
    )
  )
    return false;
  folder.parentId = parent;
  return true;
}
export function moveKnowledgeFolders(folders, ids, parentId) {
  const selected = new Set(ids);
  const roots = folders.filter(
    folder =>
      selected.has(folder.id) &&
      !folderTrail(folder.id, folders)
        .slice(0, -1)
        .some(item => selected.has(item.id)),
  );
  const candidate = structuredClone(folders);
  if (!roots.length || !roots.every(folder => moveKnowledgeFolder(candidate, folder.id, parentId))) return false;
  const parents = new Map(candidate.map(folder => [folder.id, folder.parentId]));
  folders.forEach(folder => {
    folder.parentId = parents.get(folder.id);
  });
  return true;
}
