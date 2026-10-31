export const validAliases = value =>
  value == null || (Array.isArray(value) && value.length <= 50 && value.every(v => typeof v === 'string' && v.trim() && v.length <= 80));
export function renameKnowledgeTag(notes, from, to) {
  const target = String(to).trim();
  if (!target || target.length > 80) throw new TypeError('Invalid tag');
  return notes.map(note => {
    if (!(note.tags || []).some(tag => tag.toLocaleLowerCase() === from.toLocaleLowerCase())) return note;
    const tagAliases = [...new Set([...(note.tagAliases || []), from])];
    if (!validAliases(tagAliases)) throw new TypeError('Too many tag aliases');
    return { ...note, tags: [...new Set(note.tags.map(tag => (tag.toLocaleLowerCase() === from.toLocaleLowerCase() ? target : tag)))], tagAliases };
  });
}
