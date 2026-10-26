// Words are AND-ed; quoted phrases retain their internal spaces. No regex input.
export const searchTerms = query =>
  (String(query || '').match(/"[^"]+"|\S+/g) || [])
    .slice(0, 16)
    .map(term => term.replace(/^"|"$/g, '').toLocaleLowerCase())
    .filter(Boolean);

export function textMatcher(query) {
  const terms = searchTerms(query);
  return value => {
    const text = String(value || '').toLocaleLowerCase();
    return terms.every(term => text.includes(term));
  };
}
