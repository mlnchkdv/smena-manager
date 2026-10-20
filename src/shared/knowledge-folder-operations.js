export function renameKnowledgeFolder(folders, id, value) {
  const folder = folders.find(item => item.id === id);
  const name = String(value || '').trim();
  if (!folder || !name) return { ok: false, reason: 'missing' };
  if (
    folders.some(
      item => item.id !== id && (item.parentId || null) === (folder.parentId || null) && item.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase(),
    )
  )
    return { ok: false, reason: 'collision' };
  folder.name = name;
  return { ok: true };
}

export function deleteKnowledgeFolder(document, id, actor, now = new Date().toISOString()) {
  const { knowledgeFolders: folders, knowledgeNotes: notes } = document;
  const folder = folders.find(item => item.id === id);
  if (!folder) return { ok: false, reason: 'missing' };
  const parentId = folders.some(item => item.id === folder.parentId) ? folder.parentId : null;
  const children = folders.filter(item => item.parentId === id);
  const names = new Set(folders.filter(item => item.id !== id && (item.parentId || null) === parentId).map(item => item.name.trim().toLocaleLowerCase()));
  for (const child of children) {
    const name = child.name.trim().toLocaleLowerCase();
    if (names.has(name)) return { ok: false, reason: 'collision' };
    names.add(name);
  }
  children.forEach(item => {
    item.parentId = parentId;
  });
  notes.forEach(note => {
    if (note.folderId === id) Object.assign(note, { folderId: parentId, updatedAt: now, updatedBy: actor });
  });
  document.knowledgeFolders = folders.filter(item => item.id !== id);
  return { ok: true, parentId };
}
