import { parseKnowledgeQuery, matchesKnowledgeRules } from './knowledge-query.js';
import { knowledgeDisplayParts } from './knowledge-frontmatter.js';
import { markdownText } from './markdown-text.js';
export { searchTerms } from './search-query.js';

export const searchableNote = note =>
  [
    note.title,
    note.summary,
    note.sourceName,
    note.typeId,
    ...(note.aliases || []),
    ...(note.tagAliases || []),
    ...Object.values(note.properties || {}),
    note.formatted_markdown,
    ...(note.tags || []),
  ]
    .join(' ')
    .toLocaleLowerCase();
export function createKnowledgeMatcher(query) {
  const { terms, rules } = parseKnowledgeQuery(query);
  // A blank search must not read/lowercase the full text of every stored note.
  if (!terms.length && !rules.length) return () => true;
  return note => {
    const text = searchableNote(note);
    return matchesKnowledgeRules(note, rules) && terms.every(term => text.includes(term));
  };
}
export const matchesKnowledgeSearch = (note, query) => createKnowledgeMatcher(query)(note);
const cleanNoteText = (note, value) =>
  note.sourceFormat === 'text'
    ? String(value || '')
        .replace(/\s+/g, ' ')
        .trim()
    : markdownText(value);
function analyzedText(text, terms) {
  const lower = text.toLocaleLowerCase();
  const positions = terms.map(term => lower.indexOf(term)).filter(index => index >= 0);
  return { text, score: positions.length, index: positions.length ? Math.min(...positions) : 0 };
}
function searchExcerptParts(note, terms) {
  const summary = analyzedText(cleanNoteText(note, note.summary), terms);
  // The body cannot outrank a summary containing every term. Avoid even
  // reading/normalizing that large source for a metadata-only hit.
  if (summary.score === terms.length) return { summary, chosen: summary };
  const parts = knowledgeDisplayParts(note);
  const body = analyzedText(cleanNoteText(note, parts.body), terms);
  return { summary, body, parts, chosen: !summary.text || body.score > summary.score ? body : summary };
}
function excerptText(match, length = 180) {
  const start = Math.max(0, match.index - 45);
  return `${start ? '…' : ''}${match.text.slice(start, start + length)}${start + length < match.text.length ? '…' : ''}`;
}
// Explain matches outside the visible title without exposing import service fields.
export function knowledgeSearchContext(note, query) {
  const { terms } = parseKnowledgeQuery(query);
  if (!terms.length) return null;
  const detail = searchExcerptParts(note, terms);
  if (detail.summary.score || detail.body?.score) return { label: 'Matching text', text: excerptText(detail.chosen) };
  const includes = value => {
    const lower = String(value || '').toLocaleLowerCase();
    return terms.some(term => lower.includes(term));
  };
  const tags = (note.tags || []).filter(includes);
  if (tags.length) return { label: 'Tags', text: tags.join(', ') };
  if (includes(note.title)) return { label: 'Note title', text: note.title };
  if (includes(note.sourceName)) return { label: 'Imported filename', text: note.sourceName };
  if (includes(detail.parts.metadata)) return { label: 'Import metadata', text: '', message: 'Match in import metadata' };
  return null;
}
export function knowledgeExcerpt(note, query, length = 180) {
  const clean = value => cleanNoteText(note, value);
  const { terms } = parseKnowledgeQuery(query);
  if (!terms.length) {
    // A card needs only an opening excerpt. Never normalize megabytes of a
    // loaded source again while a toolbar, modal or background sync redraws it.
    const budget = Math.min(32000, Math.max(4096, length * 8));
    let raw = String(note.summary || ''),
      text = clean(raw.slice(0, budget));
    if (!text) {
      raw = knowledgeDisplayParts(note).body;
      text = clean(raw.slice(0, budget));
    }
    return text ? text.slice(0, length) + (text.length > length || raw.length > budget ? '…' : '') : '';
  }
  return excerptText(searchExcerptParts(note, terms).chosen, length);
}
// Catalog copy only: never rewrite source text or suppress actual search matches.
export function noteCardExcerpt(note, query) {
  if (note.bodyPending && !Object.hasOwn(note, 'formatted_markdown')) return String(note.summary || note.bodyPreview || '').slice(0, 180);
  if (query || note.summary || note.sourceFormat === 'text') return knowledgeExcerpt(note, query);
  const body = String(note.formatted_markdown || '').replace(
    /^# (?:Новая заметка\r?\n\r?\nДобавьте сюда знания, регламент или рабочие договорённости команды\.|New note\r?\n\r?\nAdd team knowledge, guidelines, or working agreements here\.)\s*/u,
    '',
  );
  return knowledgeExcerpt({ ...note, formatted_markdown: body }, query);
}
