import { knowledgeActor } from './knowledge-access.js';
import { getStorageProvider } from './storage/index.js';
import { knowledgeSearchParts, loadSearchPart, knowledgeSearchError } from './knowledge-search-store.js';
import { knowledgeView } from '../shared/knowledge-view.js';
import { createKnowledgeMatcher, searchableNote, knowledgeSearchContext } from '../shared/knowledge-search.js';
import { parseKnowledgeQuery, matchesKnowledgeRules } from '../shared/knowledge-query.js';
import { textMatcher, searchTerms } from '../shared/search-query.js';
import { readKnowledgeDirectory, directoryMayMatch } from './knowledge-search-directory.js';

// Membership and metadata filters precede reads, snippets and counts. The cold
// path scans compressed derived parts, never current bodies or history blobs.
export async function queryKnowledgeIndex(database, profile, profiles = [], options = {}) {
  options.signal?.throwIfAborted();
  const actor = knowledgeActor(database, profile, profiles);
  const favorites = database._userPrefs?.[actor.id]?.favorites || '[]';
  const { terms, rules } = options.mode === 'workspace' ? { terms: searchTerms(options.query), rules: [] } : parseKnowledgeQuery(options.query);
  const eligible = knowledgeView(database.knowledgeNotes || [], {
    ...options,
    query: '',
    folders: database.knowledgeFolders || [],
    favorites,
    limit: Infinity,
  }).filtered.filter(note => matchesKnowledgeRules(note, rules));
  const textMatch = textMatcher(options.query);
  const match = options.mode === 'workspace' ? note => textMatch(searchableNote(note)) : createKnowledgeMatcher(options.query);
  const matches = new Set();
  const parts = terms.length && eligible.some(note => note.bodyRef) ? knowledgeSearchParts(database) : [];
  const membership = new Map(parts.flatMap(part => part.members.map(([id, sha]) => [id, { part, sha }])));
  const storage = getStorageProvider();
  const directory = parts.length ? await readKnowledgeDirectory(storage, database._knowledgeSearch, { signal: options.signal }) : null;
  const groups = new Map();
  for (const note of eligible) {
    if (!terms.length || !note.bodyRef) {
      if (match(note)) matches.add(note.id);
      continue;
    }
    const indexed = membership.get(note.id);
    if (!indexed || indexed.sha !== note.bodyRef.sha256) throw knowledgeSearchError();
    const { part } = indexed;
    if (!directoryMayMatch(directory?.get(part.prefix), terms, searchableNote(note))) continue;
    if (!groups.has(part)) groups.set(part, []);
    groups.get(part).push(note);
  }
  const work = [...groups];
  async function worker() {
    while (work.length) {
      options.signal?.throwIfAborted();
      const [part, notes] = work.shift(),
        rows = await loadSearchPart(storage, part, { signal: options.signal });
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
  const snippets = {};
  if (terms.length)
    for (const note of result.visible) {
      const indexed = membership.get(note.id);
      const body = indexed ? (await loadSearchPart(storage, indexed.part, { signal: options.signal })).get(note.id)?.[2] : note.formatted_markdown;
      const context = knowledgeSearchContext({ ...note, formatted_markdown: body }, options.query);
      if (context) snippets[note.id] = { ...context, text: String(context.text || '').slice(0, 240) };
    }
  return {
    ids: result.visible.map(note => note.id),
    matches: found.map(note => note.id),
    total: result.total,
    start: result.start,
    hasMore: result.hasMore,
    revision: Number(database._documentRevisions?.knowledge?.revision || 0),
    favorites,
    complete: true,
    snippets,
  };
}
