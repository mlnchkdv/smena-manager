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
