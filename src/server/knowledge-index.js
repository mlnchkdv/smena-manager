import { searchTerms, searchableNote } from '../shared/knowledge-search.js';
import { knowledgeView } from '../shared/knowledge-view.js';
export function createKnowledgeIndex(notes) {
  const postings = new Map();
  const all = new Map(notes.map(note => [note.id, note]));
  for (const note of notes) {
    const text = searchableNote(note),
      grams = new Set();
    for (let i = 0; i + 2 < text.length; i++) grams.add(text.slice(i, i + 3));
    for (const gram of grams) {
      if (!postings.has(gram)) postings.set(gram, new Set());
      postings.get(gram).add(note.id);
    }
  }
  return {
    search(options = {}) {
      const sets = searchTerms(options.query)
        .filter(term => term.length >= 3)
        .map(term => postings.get(term.slice(0, 3)) || new Set())
        .sort((a, b) => a.size - b.size);
      const candidates = sets.length ? [...sets[0]].filter(id => sets.every(set => set.has(id))).map(id => all.get(id)) : notes;
      const result = knowledgeView(candidates, { ...options, limit: 60 });
      return { ids: result.visible.map(note => note.id), total: result.total, start: result.start, hasMore: result.hasMore };
    },
  };
}
let cache;
export function indexedKnowledgePage(database, options) {
  const revision = Number(database._documentRevisions?.knowledge?.revision || 0);
  const key = `${database.createdAt}:${database.revision}:${revision}`;
  if (!cache || cache.key !== key) cache = { key, index: createKnowledgeIndex(database.knowledgeNotes || []) };
  return { ...cache.index.search(options), revision };
}
