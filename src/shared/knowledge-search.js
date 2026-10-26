import { knowledgeDisplayParts } from './knowledge-frontmatter.js';
import { markdownText } from './markdown-text.js';

export const searchTerms = query =>
  (String(query || '').match(/"[^"]+"|\S+/g) || [])
    .slice(0, 16)
    .map(term => term.replace(/^"|"$/g, '').toLocaleLowerCase())
    .filter(Boolean);
export const searchableNote = note => [note.title, note.summary, note.formatted_markdown, ...(note.tags || [])].join(' ').toLocaleLowerCase();
export function createKnowledgeMatcher(query) {
  const terms = searchTerms(query);
  // A blank search must not read/lowercase the full text of every stored note.
  if (!terms.length) return () => true;
  return note => {
    const text = searchableNote(note);
    return terms.every(term => text.includes(term));
  };
}
export const matchesKnowledgeSearch = (note, query) => createKnowledgeMatcher(query)(note);
export function knowledgeExcerpt(note, query, length = 180) {
  const clean = value =>
    note.sourceFormat === 'text'
      ? String(value || '')
          .replace(/\s+/g, ' ')
          .trim()
      : markdownText(value);
  const terms = searchTerms(query);
  const summary = clean(note.summary);
  const body = clean(knowledgeDisplayParts(note).body);
  const score = text => terms.filter(term => text.toLocaleLowerCase().includes(term)).length;
  // A summary must not hide a match that was found only in the full text.
  const text = !summary || score(body) > score(summary) ? body : summary;
  const index =
    terms
      .map(term => text.toLocaleLowerCase().indexOf(term))
      .filter(index => index >= 0)
      .sort((a, b) => a - b)[0] || 0;
  const start = Math.max(0, index - 45);
  return `${start ? '…' : ''}${text.slice(start, start + length)}${start + length < text.length ? '…' : ''}`;
}
