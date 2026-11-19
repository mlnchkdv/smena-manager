import { searchTerms } from './knowledge-search.js';
import { listWindow } from './list-window.js';
import { calendarDate } from './calendar-time.js';

export function bookmarkContextPage(ui, { query = '', folder = 'all', scope = 'active', archive = 'all', capturedAfter = '', sort = 'updated' } = {}) {
  const key = JSON.stringify([String(query).trim().toLocaleLowerCase(), folder, scope, archive, capturedAfter, sort]);
  ui.listPages ||= {};
  if (ui.bookmarkFilterKey !== key) ui.listPages.bookmarks = 0;
  ui.bookmarkFilterKey = key;
  return ui.listPages.bookmarks;
}

/** Keep a saved bookmark visible even if its title, folder or archive state changed. */
export function savedBookmarkView(link, folderFilter = 'all', { archive = 'all', capturedAfter = '', timeZone = 'UTC' } = {}) {
  const folderMatches = folderFilter === 'all' || (folderFilter === 'root' ? !link.folder : link.folder === folderFilter);
  const copies = link.pageSnapshots || [];
  const visibleArchive = matchesCopies(copies, archive, '', timeZone) ? archive : 'all';
  return {
    bookmarkQuery: '',
    bookmarkScope: link.is_archived ? 'archived' : 'active',
    bookmarkFolder: folderMatches ? folderFilter : link.folder || 'root',
    ...(visibleArchive !== archive ? { bookmarkArchiveFilter: visibleArchive } : {}),
    ...(capturedAfter && !matchesCopies(copies, visibleArchive, capturedAfter, timeZone) ? { bookmarkCapturedAfter: '' } : {}),
  };
}

function matchesCopies(copies, archive, capturedAfter, timeZone) {
  if (archive === 'none') return !capturedAfter && !copies.length;
  if (archive === 'all' && !capturedAfter) return true;
  return copies.some(ref => {
    if (archive === 'html' && ref.format !== 'html') return false;
    if (archive === 'text' && ref.format === 'html') return false;
    if (archive === 'incomplete' && !(ref.capture?.missing > 0)) return false;
    if (!capturedAfter) return true;
    const stamp = Date.parse(ref.capturedAt);
    return Number.isFinite(stamp) && calendarDate(stamp, timeZone) >= capturedAfter;
  });
}

export function bookmarkView(
  links,
  { query = '', folder = 'all', scope = 'active', page = 0, archive = 'all', capturedAfter = '', sort = 'updated', timeZone = 'UTC' } = {},
) {
  const terms = searchTerms(query);
  const filtered = links
    .filter(link => (scope === 'archived' ? link.is_archived : !link.is_archived))
    .filter(link => folder === 'all' || (folder === 'root' ? !link.folder : link.folder === folder))
    .filter(link => matchesCopies(link.pageSnapshots || [], archive, capturedAfter, timeZone))
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
