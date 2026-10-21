import { searchTerms } from './knowledge-search.js';

// Iterative forest traversal avoids stack overflow for imported, deeply nested folders.
export function createKnowledgeFolderIndex(folders, notes = []) {
  const byId = new Map(folders.map(folder => [folder.id, folder]));
  const parents = new Map(folders.map(folder => [folder.id, byId.has(folder.parentId) && folder.parentId !== folder.id ? folder.parentId : null]));
  const resolved = new Set();
  for (const id of byId.keys()) {
    const path = [],
      seen = new Set();
    let current = id;
    while (current && !resolved.has(current) && !seen.has(current)) {
      seen.add(current);
      path.push(current);
      current = parents.get(current);
    }
    // Recover a visible root for malformed cycles without changing shared data.
    if (seen.has(current)) parents.set(current, null);
    path.forEach(item => resolved.add(item));
  }
  const children = new Map([[null, []]]);
  for (const folder of byId.values()) {
    const parent = parents.get(folder.id);
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(folder);
  }
  const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
  for (const items of children.values()) items.sort((a, b) => collator.compare(String(a.name || ''), String(b.name || '')));
  const order = [],
    depths = new Map(),
    counts = new Map([...byId.keys()].map(id => [id, 0]));
  const stack = (children.get(null) || [])
    .slice()
    .reverse()
    .map(folder => [folder.id, 0]);
  while (stack.length) {
    const [id, depth] = stack.pop();
    order.push(id);
    depths.set(id, depth);
    for (const folder of (children.get(id) || []).slice().reverse()) stack.push([folder.id, depth + 1]);
  }
  for (const note of notes) if (counts.has(note.folderId)) counts.set(note.folderId, counts.get(note.folderId) + 1);
  for (const id of order.slice().reverse()) {
    const parent = parents.get(id);
    if (parent) counts.set(parent, counts.get(parent) + counts.get(id));
  }
  return { byId, parents, children, order, depths, counts };
}

// Inherit matched terms, not complete path strings. Keep only enough path suffix
// to recognize a quoted phrase crossing a separator, even in very deep trees.
export function knowledgeFolderMatches(index, query) {
  const terms = searchTerms(query);
  if (!terms.length) return new Set(index.order);
  const full = (1 << terms.length) - 1;
  const suffixLength = Math.max(...terms.map(term => term.length)) - 1;
  const masks = new Map(),
    suffixes = new Map(),
    matches = new Set();
  for (const id of index.order) {
    const parent = index.parents.get(id);
    const context = (parent ? (suffixes.get(parent) || '') + ' / ' : '') + String(index.byId.get(id).name || '').toLocaleLowerCase();
    let mask = masks.get(parent) || 0;
    terms.forEach((term, i) => {
      if (context.includes(term)) mask |= 1 << i;
    });
    masks.set(id, mask);
    suffixes.set(id, suffixLength ? context.slice(-suffixLength) : '');
    if (mask === full) matches.add(id);
  }
  return matches;
}

export function knowledgeFolderDestinations(index, parentId, { query = '', offset = 0, limit = 60 } = {}) {
  if (!searchTerms(query).length) return knowledgeFolderChildren(index, parentId, { offset, limit });
  const matches = knowledgeFolderMatches(index, query);
  const folders = index.order.filter(id => matches.has(id)).map(id => index.byId.get(id));
  const start = Math.min(Math.max(0, Number(offset) || 0), Math.max(0, Math.ceil(folders.length / limit) - 1) * limit);
  return { folders: folders.slice(start, start + limit), total: folders.length, start, hasMore: start + limit < folders.length };
}

export function knowledgeFolderRows(index, { query = '', collapsed = {}, offset = 0, limit = 200, revealId } = {}) {
  const text = String(query).trim().toLocaleLowerCase();
  const matches = text ? knowledgeFolderMatches(index, query) : new Set();
  if (text)
    for (const id of index.order.slice().reverse()) {
      if (matches.has(id)) matches.add(index.parents.get(id));
    }
  const rows = [];
  let hiddenBelow = null;
  for (const id of index.order) {
    const depth = index.depths.get(id);
    if (hiddenBelow !== null && depth > hiddenBelow) continue;
    hiddenBelow = null;
    if (text && !matches.has(id)) continue;
    const isCollapsed = !text && collapsed[id] === true;
    rows.push({ folder: index.byId.get(id), depth, hasChildren: !!index.children.get(id)?.length, isCollapsed });
    if (isCollapsed) hiddenBelow = depth;
  }
  const selected = revealId ? rows.findIndex(row => row.folder.id === revealId) : -1;
  const requested = selected >= 0 ? Math.floor(selected / limit) * limit : Math.max(0, Number(offset) || 0);
  const start = Math.min(requested, Math.max(0, Math.ceil(rows.length / limit) - 1) * limit);
  return { rows: rows.slice(start, start + limit), total: rows.length, start, hasMore: start + limit < rows.length };
}

export function knowledgeFolderChildren(index, parentId, { query = '', offset = 0, limit = 6 } = {}) {
  const terms = searchTerms(query);
  const filtered = (index.children.get(parentId || null) || []).filter(folder => {
    const text = String(folder.name || '').toLocaleLowerCase();
    return terms.every(term => text.includes(term));
  });
  const start = Math.min(Math.max(0, Number(offset) || 0), Math.max(0, Math.ceil(filtered.length / limit) - 1) * limit);
  return { folders: filtered.slice(start, start + limit), total: filtered.length, start, hasMore: start + limit < filtered.length };
}
