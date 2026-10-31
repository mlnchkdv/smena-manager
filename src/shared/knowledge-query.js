import { searchTerms } from './search-query.js';
export function parseKnowledgeQuery(query) {
  const rules = [],
    text = [];
  for (const term of searchTerms(query)) {
    let match;
    if ((match = term.match(/^(type|tag|has|capture):(.+)$/))) rules.push({ field: match[1], value: match[2], op: '=' });
    else if ((match = term.match(/^(field:[\w-]+|updated)(!=|<=|>=|=|<|>)(.+)$/))) rules.push({ field: match[1], op: match[2], value: match[3] });
    else text.push(term);
  }
  return { rules, terms: text };
}
export function matchesKnowledgeRules(note, rules) {
  return rules.every(rule => {
    if (rule.field === 'capture') return note.captureStatus === rule.value;
    if (rule.field === 'type') return (note.typeId || 'note').toLowerCase() === rule.value;
    if (rule.field === 'tag') return [...(note.tags || []), ...(note.tagAliases || [])].some(tag => tag.toLocaleLowerCase() === rule.value);
    if (rule.field === 'has') return Object.hasOwn(note.properties || {}, rule.value) && note.properties[rule.value] !== '';
    const raw = rule.field === 'updated' ? note.updatedAt : note.properties?.[rule.field.slice(6)];
    if (raw == null || raw === '') return false;
    const a = typeof raw === 'number' ? raw : String(raw).toLocaleLowerCase(),
      b = typeof raw === 'number' ? Number(rule.value) : rule.value;
    if (typeof b === 'number' && !Number.isFinite(b)) return false;
    return { '=': () => a === b, '!=': () => a !== b, '<': () => a < b, '>': () => a > b, '<=': () => a <= b, '>=': () => a >= b }[rule.op]();
  });
}
export function validKnowledgeQueries(items) {
  return (
    Array.isArray(items) &&
    items.length <= 20 &&
    new Set(items.map(item => item?.id)).size === items.length &&
    items.every(
      item =>
        item &&
        typeof item.id === 'string' &&
        /^[\w-]{1,100}$/.test(item.id) &&
        typeof item.name === 'string' &&
        item.name.trim() &&
        item.name.length <= 80 &&
        typeof item.query === 'string' &&
        item.query.length <= 1000,
    )
  );
}
