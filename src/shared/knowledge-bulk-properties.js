import { noteTypes, noteType, validNoteProperties } from './knowledge-types.js';
const tags = value => [
  ...new Set(
    String(value || '')
      .split(',')
      .map(v => v.trim())
      .filter(Boolean),
  ),
];
export function bulkNoteProperties(notes, ids, patch, ws) {
  const selected = new Set(ids);
  if (!selected.size || selected.size > 500 || selected.size !== ids.length || ids.some(id => !notes.some(note => note.id === id)))
    throw Error('The selection changed.');
  const add = tags(patch.addTags),
    remove = new Set(tags(patch.removeTags).map(tag => tag.toLocaleLowerCase()));
  if (add.some(tag => remove.has(tag.toLocaleLowerCase())))
    throw Object.assign(Error('A tag cannot be added and removed in the same change.'), { code: 'BULK_TAG_CONFLICT' });
  if ([...add, ...remove].some(tag => tag.length > 80)) throw Error('Tags must be at most 80 characters.');
  if (patch.typeId && !noteTypes(ws).some(type => type.id === patch.typeId)) throw Error('The note type changed.');
  return notes.map(note => {
    if (!selected.has(note.id)) return note;
    const next = { ...note, ...(patch.typeId ? { typeId: patch.typeId } : {}) };
    const seen = new Set();
    next.tags = [...(note.tags || []), ...add].filter(tag => {
      const key = tag.toLocaleLowerCase();
      if (remove.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (next.tags.length > 100) throw Error('Too many tags.');
    if (patch.property) {
      const field = noteType(next, ws).fields.find(field => field.id === patch.property);
      if (!field) throw Error('Choose a property common to the selected types.');
      let value = String(patch.value ?? '');
      if (field.kind === 'number') {
        if (!value.trim() || !Number.isFinite(Number(value))) throw Error('Enter a valid number.');
        value = Number(value);
      }
      if (field.kind === 'checkbox') {
        if (!['true', 'false'].includes(value)) throw Error('Use true or false.');
        value = value === 'true';
      }
      if (field.kind === 'date' && value && (!/^\d{4}-\d{2}-\d{2}$/u.test(value) || new Date(value).toISOString().slice(0, 10) !== value))
        throw Error('Enter a valid date.');
      next.properties = { ...note.properties, [patch.property]: value };
    }
    if (!validNoteProperties(next)) throw Error('Invalid note properties.');
    return (note.typeId || 'note') === (next.typeId || 'note') &&
      JSON.stringify(note.tags || []) === JSON.stringify(next.tags || []) &&
      JSON.stringify(note.properties || {}) === JSON.stringify(next.properties || {})
      ? note
      : next;
  });
}
