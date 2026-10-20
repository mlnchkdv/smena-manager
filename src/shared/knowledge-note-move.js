// Validate the complete operation before touching any note. Re-resolve at confirmation.
export function moveKnowledgeNotes(notes, folders, ids, folderId, actor, now = new Date().toISOString()) {
  const destination = folderId || null;
  const selected = new Set(ids);
  const matches = notes.filter(note => selected.has(note.id));
  if (!selected.size || matches.length !== selected.size || (destination && !folders.some(folder => folder.id === destination))) return { ok: false, moved: 0 };
  let moved = 0;
  for (const note of matches) {
    if ((note.folderId || null) === destination) continue;
    Object.assign(note, { folderId: destination, updatedAt: now, updatedBy: actor });
    moved++;
  }
  return { ok: true, moved };
}
