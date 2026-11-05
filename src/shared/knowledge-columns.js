export function normalizeKnowledgeColumnSort(sort, visibleKeys) {
  return sort?.key === 'title' || visibleKeys.includes(sort?.key) ? { key: sort.key, desc: !!sort.desc } : { key: 'title', desc: false };
}

export function knowledgeColumnValue(note, key) {
  if (key === 'title') return note.title || '';
  if (key === 'type') return note.typeId || 'note';
  if (key === 'tags') return (note.tags || []).join(', ');
  if (key === 'updated') return Date.parse(note.updatedAt || '') || 0;
  const [prefix, type, field] = String(key).split(':');
  return prefix === 'property' && (note.typeId || 'note') === type ? (note.properties?.[field] ?? null) : null;
}
export function compareKnowledgeColumn(a, b, sort) {
  const left = knowledgeColumnValue(a, sort.key),
    right = knowledgeColumnValue(b, sort.key);
  if (left == null || right == null) return left == null && right == null ? 0 : left == null ? 1 : -1;
  const order =
    typeof left === 'number' && typeof right === 'number'
      ? left - right
      : String(left).localeCompare(String(right), undefined, { sensitivity: 'base', numeric: true });
  return (sort.desc ? -order : order) || String(a.title || '').localeCompare(String(b.title || ''));
}
