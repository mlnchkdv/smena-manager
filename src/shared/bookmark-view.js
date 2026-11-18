import { searchTerms } from './knowledge-search.js';
import { listWindow } from './list-window.js';

export function bookmarkContextPage(ui, { query = '', folder = 'all', scope = 'active', archive = 'all', capturedAfter = '', sort = 'updated' } = {}) {
  const key = JSON.stringify([String(query).trim().toLocaleLowerCase(), folder, scope, archive, capturedAfter, sort]);
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

export function bookmarkView(links, { query = '', folder = 'all', scope = 'active', page = 0, archive = 'all', capturedAfter = '', sort = 'updated' } = {}) {
  const terms = searchTerms(query);
  const filtered = links
    .filter(link => (scope === 'archived' ? link.is_archived : !link.is_archived))
    .filter(link => folder === 'all' || (folder === 'root' ? !link.folder : link.folder === folder))
    .filter(link => {
      const copies = link.pageSnapshots || [];
      if (capturedAfter && !copies.some(ref => String(ref.capturedAt).slice(0, 10) >= capturedAfter)) return false;
      return archive === 'none'
        ? !copies.length
        : archive === 'html'
          ? copies.some(ref => ref.format === 'html')
          : archive === 'text'
            ? copies.some(ref => ref.format !== 'html')
            : archive === 'incomplete'
              ? copies.some(ref => ref.capture?.missing > 0)
              : true;
    })
    .filter(link => {
      if (!terms.length) return true;
      const text = [link.title, link.description, link.excerpt, link.url, link.site_name, ...(link.tags || [])].join(' ').toLocaleLowerCase();
      return terms.every(term => text.includes(term));
    })
    .sort((a, b) =>
      sort === 'captured'
        ? Math.max(0, ...(b.pageSnapshots || []).map(ref => Date.parse(ref.capturedAt) || 0)) -
          Math.max(0, ...(a.pageSnapshots || []).map(ref => Date.parse(ref.capturedAt) || 0))
        : (Date.parse(b.updated_at || b.created_at) || 0) - (Date.parse(a.updated_at || a.created_at) || 0),
    );
  return listWindow(filtered, page, 60);
}
