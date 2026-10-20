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

export function knowledgeFolderRows(index, { query = '', collapsed = {}, offset = 0, limit = 200, revealId } = {}) {
  const text = String(query).trim().toLocaleLowerCase();
  const matches = new Set();
  if (text)
    for (const id of index.order.slice().reverse()) {
      if (
        String(index.byId.get(id).name || '')
          .toLocaleLowerCase()
          .includes(text)
      )
        matches.add(id);
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
  const text = String(query).trim().toLocaleLowerCase();
  const filtered = (index.children.get(parentId || null) || []).filter(folder =>
    String(folder.name || '')
      .toLocaleLowerCase()
      .includes(text),
  );
  const start = Math.min(Math.max(0, Number(offset) || 0), Math.max(0, Math.ceil(filtered.length / limit) - 1) * limit);
  return { folders: filtered.slice(start, start + limit), total: filtered.length, start, hasMore: start + limit < filtered.length };
}
