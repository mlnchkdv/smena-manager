import { searchTerms } from './knowledge-search.js';
import { listWindow } from './list-window.js';

export function bookmarkContextPage(ui, { query = '', folder = 'all', scope = 'active' } = {}) {
  const key = JSON.stringify([String(query).trim().toLocaleLowerCase(), folder, scope]);
  ui.listPages ||= {};
  if (ui.bookmarkFilterKey !== key) ui.listPages.bookmarks = 0;
  ui.bookmarkFilterKey = key;
  return ui.listPages.bookmarks;
}

/** Keep a saved bookmark visible even if its title, folder or archive state changed. */
export function savedBookmarkView(link, folderFilter = 'all') {
  const folderMatches = folderFilter === 'all' || (folderFilter === 'root' ? !link.folder : link.folder === folderFilter);
  return {
    bookmarkQuery: '',
    bookmarkScope: link.is_archived ? 'archived' : 'active',
    bookmarkFolder: folderMatches ? folderFilter : link.folder || 'root',
  };
}

export function bookmarkView(links, { query = '', folder = 'all', scope = 'active', page = 0 } = {}) {
  const terms = searchTerms(query);
  const filtered = links
    .filter(link => (scope === 'archived' ? link.is_archived : !link.is_archived))
    .filter(link => folder === 'all' || (folder === 'root' ? !link.folder : link.folder === folder))
    .filter(link => {
      if (!terms.length) return true;
      const text = [link.title, link.description, link.excerpt, link.url, link.site_name, ...(link.tags || [])].join(' ').toLocaleLowerCase();
      return terms.every(term => text.includes(term));
    })
    .sort((a, b) => (Date.parse(b.updated_at || b.created_at) || 0) - (Date.parse(a.updated_at || a.created_at) || 0));
  return listWindow(filtered, page, 60);
}
