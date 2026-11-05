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
export function createKnowledgeColumnComparator(sort, context = {}) {
  const collator = new Intl.Collator(context.locale, { sensitivity: 'base', numeric: true });
  const types = new Map((context.types || []).map(type => [type.id, type]));
  const members = new Map((context.members || []).map(member => [member.id, member.name]));
  const projects = new Map((context.projects || []).map(project => [project.id, project.name]));
  const label = type => type && (String(context.locale).startsWith('ru') && type.ru ? type.ru : type.name);
  const value = note => {
    const raw = knowledgeColumnValue(note, sort.key);
    if (sort.key === 'type' && context.types) return label(types.get(raw)) || null;
    const [, typeId, fieldId] = String(sort.key).split(':');
    const field = types.get(typeId)?.fields?.find(field => field.id === fieldId);
    if (field?.kind === 'member') return members.get(raw) || null;
    if (field?.kind === 'project') return projects.get(raw) || null;
    return raw === '' ? null : raw;
  };
  const tie = (a, b) => collator.compare(String(a.title || ''), String(b.title || '')) || String(a.id || '').localeCompare(String(b.id || ''));
  return (a, b) => {
    const left = value(a),
      right = value(b);
    if (left == null || right == null) return left == null && right == null ? tie(a, b) : left == null ? 1 : -1;
    const order = typeof left === 'number' && typeof right === 'number' ? left - right : collator.compare(String(left), String(right));
    return (sort.desc ? -order : order) || tie(a, b);
  };
}
export function compareKnowledgeColumn(a, b, sort, context) {
  return createKnowledgeColumnComparator(sort, context)(a, b);
}
