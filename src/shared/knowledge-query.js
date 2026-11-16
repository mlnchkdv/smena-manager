// Preserve operator values and quoted phrases as one token, including escaped
// quotes/backslashes. Raw spans are also used by removable query chips.
export function tokenizeKnowledgeQuery(query) {
  const input = String(query || ''),
    tokens = [];
  let value = '',
    start = -1,
    quoted = false;
  const push = end => {
    if (start >= 0) tokens.push({ raw: input.slice(start, end), value });
    value = '';
    start = -1;
  };
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (/\s/u.test(char) && !quoted) {
      push(i);
      continue;
    }
    if (start < 0) start = i;
    if (char === '\\' && quoted && ['"', '\\'].includes(input[i + 1])) value += input[++i];
    else if (char === '"') quoted = !quoted;
    else value += char;
  }
  push(input.length);
  return { tokens, error: quoted ? 'unclosed_quote' : tokens.length > 16 ? 'too_many_terms' : null };
}
const timestamp = value => (typeof value === 'number' ? value : /^\d{12,14}$/.test(String(value)) ? Number(value) : Date.parse(value));
function dateCondition(value) {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (!day && !/^\d{4}-\d{2}-\d{2}t\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(z|[+-]\d{2}:\d{2})$/i.test(value) && !/^\d{12,14}$/.test(value)) return null;
  const at = timestamp(value);
  const calendar = value.slice(0, 10);
  if (!Number.isFinite(at) || (/^\d{4}-\d{2}-\d{2}/.test(value) && new Date(Date.parse(calendar)).toISOString().slice(0, 10) !== calendar)) return null;
  return { at, day };
}
export function knowledgeQueryErrorMessage(code, language = 'en') {
  const copy = {
    unclosed_quote: ['Close the quotation marks in your query.', 'Закройте кавычки в запросе.'],
    empty_value: ['Enter a value after the query operator.', 'Укажите значение после оператора поиска.'],
    invalid_date: ['Use YYYY-MM-DD for a UTC calendar date.', 'Укажите дату в формате ГГГГ-ММ-ДД. Даты поиска — UTC.'],
    too_many_terms: ['Use at most 16 search conditions.', 'Используйте не больше 16 условий поиска.'],
  };
  return (copy[code] || copy.empty_value)[language === 'ru' ? 1 : 0];
}
export function parseKnowledgeQuery(query) {
  const rules = [],
    text = [];
  const tokenized = tokenizeKnowledgeQuery(query);
  if (tokenized.error) return { rules, terms: text, error: tokenized.error };
  for (const token of tokenized.tokens) {
    const term = token.value.toLocaleLowerCase();
    if (!term) continue;
    let match;
    if ((match = term.match(/^(type|tag|has|capture):(.*)$/))) {
      if (!match[2]) return { rules: [], terms: [], error: 'empty_value' };
      rules.push({ field: match[1], value: match[2], op: '=' });
    } else if ((match = term.match(/^(field:[\w-]+|updated)(!=|<=|>=|=|<|>)(.*)$/))) {
      if (!match[3]) return { rules: [], terms: [], error: 'empty_value' };
      if (match[1] === 'updated' && !dateCondition(match[3])) return { rules: [], terms: [], error: 'invalid_date' };
      rules.push({ field: match[1], op: match[2], value: match[3] });
    } else text.push(term);
  }
  return { rules, terms: text };
}
export function matchesKnowledgeRules(note, rules) {
  return rules.every(rule => {
    if (rule.field === 'capture') {
      const state = note.intakeSummary?.state || note.intake?.state;
      return (state === 'closed' ? 'processed' : state === 'open' ? 'unprocessed' : note.captureStatus) === rule.value;
    }
    if (rule.field === 'type') return (note.typeId || 'note').toLowerCase() === rule.value;
    if (rule.field === 'tag') return [...(note.tags || []), ...(note.tagAliases || [])].some(tag => tag.toLocaleLowerCase() === rule.value);
    if (rule.field === 'has') return Object.hasOwn(note.properties || {}, rule.value) && note.properties[rule.value] !== '';
    const raw = rule.field === 'updated' ? note.updatedAt : note.properties?.[rule.field.slice(6)];
    if (raw == null || raw === '') return false;
    if (rule.field === 'updated') {
      const date = dateCondition(rule.value),
        at = timestamp(raw);
      if (!date || !Number.isFinite(at)) return false;
      if (date.day) {
        const end = date.at + 86400000;
        return (
          {
            '=': () => at >= date.at && at < end,
            '!=': () => at < date.at || at >= end,
            '<': () => at < date.at,
            '<=': () => at < end,
            '>': () => at >= end,
            '>=': () => at >= date.at,
          }[rule.op]?.() || false
        );
      }
      return (
        {
          '=': () => at === date.at,
          '!=': () => at !== date.at,
          '<': () => at < date.at,
          '<=': () => at <= date.at,
          '>': () => at > date.at,
          '>=': () => at >= date.at,
        }[rule.op]?.() || false
      );
    }
    const a = typeof raw === 'number' ? raw : String(raw).toLocaleLowerCase(),
      b = typeof raw === 'number' ? Number(rule.value) : rule.value;
    if (typeof b === 'number' && !Number.isFinite(b)) return false;
    return { '=': () => a === b, '!=': () => a !== b, '<': () => a < b, '>': () => a > b, '<=': () => a <= b, '>=': () => a >= b }[rule.op]();
  });
}
export function validKnowledgeQueries(items) {
  // Historical collections remain loadable so a user can repair their syntax.
  // New edits and query execution perform semantic validation separately.
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
        item.query.length <= 1000 &&
        tokenizeKnowledgeQuery(item.query).tokens.length <= 16,
    )
  );
}
