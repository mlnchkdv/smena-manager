import { searchTerms } from './knowledge-search.js';
import { listWindow } from './list-window.js';

export function bookmarkView(links, { query = '', folder = 'all', scope = 'active', page = 0 } = {}) {
  const terms = searchTerms(query);
  const filtered = links
    .filter(link => (scope === 'archived' ? link.is_archived : !link.is_archived))
    .filter(link => folder === 'all' || (folder === 'root' ? !link.folder : link.folder === folder))
    .filter(link => {
      if (!terms.length) return true;
      const text = [link.title, link.description, link.url, link.site_name, ...(link.tags || [])].join(' ').toLocaleLowerCase();
      return terms.every(term => text.includes(term));
    })
    .sort((a, b) => (Date.parse(b.updated_at || b.created_at) || 0) - (Date.parse(a.updated_at || a.created_at) || 0));
  return listWindow(filtered, page, 60);
}
