import { createKnowledgeMatcher } from './knowledge-search.js';
import { folderDescendants } from './knowledge-tools.js';
import { favoriteFlag } from './personal-favorites.js';
import { createKnowledgeColumnComparator } from './knowledge-columns.js';
export function knowledgeView(
  notes,
  {
    query = '',
    folder = 'all',
    tag = '',
    activeId,
    sort = 'updated',
    propertySort,
    columnContext,
    limit = 200,
    offset = 0,
    recent = [],
    folders = [],
    favorites,
  } = {},
) {
  const compareColumn = propertySort?.key ? createKnowledgeColumnComparator(propertySort, columnContext) : null;
  const folderIds = folderDescendants(folder, folders);
  const selectedTag = String(tag).trim().toLocaleLowerCase();
  const matches = createKnowledgeMatcher(query);
  const time = note => {
    const value = typeof note.updatedAt === 'number' ? note.updatedAt : Date.parse(note.updatedAt || '');
    return Number.isFinite(value) ? value : 0;
  };
  const filtered = notes
    .filter(
      note =>
        folder === 'all' ||
        (folder === 'recent'
          ? recent.includes(note.id)
          : folder === 'favorites'
            ? favoriteFlag(favorites, 'note', note)
            : folder === 'root'
              ? !note.folderId
              : folderIds.has(note.folderId)),
    )
    .filter(note => !selectedTag || (note.tags || []).some(value => String(value).trim().toLocaleLowerCase() === selectedTag))
    .filter(matches)
    .sort((a, b) => {
      if (compareColumn) return compareColumn(a, b);
      if (folder === 'recent') return recent.indexOf(a.id) - recent.indexOf(b.id);
      const starred = Number(favoriteFlag(favorites, 'note', b)) - Number(favoriteFlag(favorites, 'note', a));
      if (starred) return starred;
      if (sort === 'title') return String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' });
      return time(b) - time(a);
    });
  const safeLimit = Number.isFinite(limit) ? Math.min(1000, Math.max(20, Number(limit))) : filtered.length;
  const active = filtered.find(note => note.id === activeId) || filtered[0] || null;
  const start = Math.min(Math.max(0, Number(offset) || 0), Math.max(0, Math.ceil(filtered.length / safeLimit) - 1) * safeLimit);
  const visible = filtered.slice(start, start + safeLimit);
  if (activeId && active && !visible.some(note => note.id === active.id)) visible.push(active);
  return { filtered, visible, active, total: filtered.length, start, hasMore: filtered.length > start + safeLimit };
}
