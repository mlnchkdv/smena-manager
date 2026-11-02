export function applyBookmarkBatch(data, ids, command, role, now = new Date().toISOString()) {
  if (!['admin', 'editor'].includes(role)) throw new Error('Permission denied');
  const selected = [...new Set(ids)];
  if (!selected.length || selected.length > 60) throw new Error('Select up to 60 bookmarks');
  if (!['move', 'addTag', 'removeTag', 'archive', 'restore'].includes(command.type)) throw new Error('Invalid operation');
  if (command.type === 'move' && command.folder && !data.linkFolders?.some(f => f.id === command.folder)) throw new Error('Folder unavailable');
  const tag = String(command.tag || '').trim();
  if (['addTag', 'removeTag'].includes(command.type) && (!tag || tag.length > 64)) throw new Error('Use a tag of 1–64 characters');
  const result = { changed: [], failed: [] };
  for (const id of selected) {
    const link = data.links?.find(item => item.id === id);
    if (!link) {
      result.failed.push(id);
      continue;
    }
    const tags = Array.isArray(link.tags) ? link.tags : [];
    if (command.type === 'addTag' && !tags.includes(tag) && tags.length >= 32) {
      result.failed.push(id);
      continue;
    }
    if (command.type === 'move') link.folder = command.folder || null;
    if (command.type === 'addTag') link.tags = [...new Set([...tags, tag])];
    if (command.type === 'removeTag') link.tags = tags.filter(t => t !== tag);
    if (command.type === 'archive' || command.type === 'restore') link.is_archived = command.type === 'archive';
    link.updated_at = now;
    result.changed.push(id);
  }
  return result;
}
