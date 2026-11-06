import { knowledgeActor } from './knowledge-access.js';
import { getStorageProvider } from './storage/index.js';
import { knowledgeSearchParts, knowledgeSearchCovered, loadSearchPart, knowledgeSearchError } from './knowledge-search-store.js';
import { knowledgeView } from '../shared/knowledge-view.js';
import { createKnowledgeMatcher, searchableNote } from '../shared/knowledge-search.js';
import { parseKnowledgeQuery, matchesKnowledgeRules } from '../shared/knowledge-query.js';
import { textMatcher } from '../shared/search-query.js';

// Membership and metadata filters precede reads, snippets and counts. The cold
// path scans compressed derived parts, never current bodies or history blobs.
export async function queryKnowledgeIndex(database, profile, profiles = [], options = {}) {
  const actor = knowledgeActor(database, profile, profiles);
  const favorites = database._userPrefs?.[actor.id]?.favorites || '[]';
  const { terms, rules } =
    options.mode === 'workspace' ? { terms: options.query?.trim() ? [options.query] : [], rules: [] } : parseKnowledgeQuery(options.query);
  const eligible = knowledgeView(database.knowledgeNotes || [], {
    ...options,
    query: '',
    folders: database.knowledgeFolders || [],
    favorites,
    limit: Infinity,
  }).filtered.filter(note => matchesKnowledgeRules(note, rules));
  const match = options.mode === 'workspace' ? note => textMatcher(options.query)(searchableNote(note)) : createKnowledgeMatcher(options.query);
  const matches = new Set();
  const parts = terms.length && eligible.some(note => note.bodyRef) ? knowledgeSearchParts(database) : [];
  const groups = new Map();
  for (const note of eligible) {
    if (!terms.length || !note.bodyRef) {
      if (match(note)) matches.add(note.id);
      continue;
    }
    if (!knowledgeSearchCovered(note, parts)) throw knowledgeSearchError();
    const part = parts.find(part => part.members.some(([id]) => id === note.id));
    if (!groups.has(part)) groups.set(part, []);
    groups.get(part).push(note);
  }
  const work = [...groups],
    storage = getStorageProvider();
  async function worker() {
    while (work.length) {
      const [part, notes] = work.shift(),
        rows = await loadSearchPart(storage, part);
      for (const note of notes) {
        const row = rows.get(note.id);
        if (!row || row[1] !== note.bodyRef.sha256) throw knowledgeSearchError();
        if (match({ ...note, formatted_markdown: row[2] })) matches.add(note.id);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, work.length) }, worker));
  const found = eligible.filter(note => matches.has(note.id));
  const result = knowledgeView(found, { ...options, query: '', folders: database.knowledgeFolders || [], favorites, limit: 60 });
  return {
    ids: result.visible.map(note => note.id),
    matches: found.map(note => note.id),
    total: result.total,
    start: result.start,
    hasMore: result.hasMore,
    revision: Number(database._documentRevisions?.knowledge?.revision || 0),
    favorites,
    complete: true,
  };
}
