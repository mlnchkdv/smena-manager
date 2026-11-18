import { parseDocument } from 'htmlparser2';
import { textContent } from 'domutils';
import { searchTerms } from '../shared/knowledge-search.js';
import { pageError } from './web-page-fetch.js';

export function createBookmarkArchiveSearch(read) {
  const cache = new Map();
  let bytes = 0;
  return async (links, { query, cursor = 0 } = {}, scope) => {
    if (typeof query !== 'string' || query.trim().length < 2 || query.length > 200 || !Number.isSafeInteger(cursor) || cursor < 0)
      throw pageError('PAGE_INVALID_SEARCH', 400);
    const terms = searchTerms(query);
    if (!terms.length) throw pageError('PAGE_INVALID_SEARCH', 400);
    const candidates = links
      .flatMap(bookmark => (bookmark.pageSnapshots || []).map(ref => ({ bookmark, ref })))
      .sort((a, b) => Date.parse(b.ref.capturedAt) - Date.parse(a.ref.capturedAt));
    const batch = candidates.slice(cursor, cursor + 20),
      matches = [];
    let unavailable = 0;
    for (let start = 0; start < batch.length; start += 4)
      await Promise.all(
        batch.slice(start, start + 4).map(async ({ bookmark, ref }) => {
          try {
            const key = `${scope}:${bookmark.id}:${ref.id}:${ref.sha256}`;
            let text = cache.get(key);
            if (text == null) {
              text = textContent(
                parseDocument((await read(bookmark, ref.id)).html.replace(/<\/(?:p|h[1-6]|li|td|th|div|section|article|tr|blockquote)>/giu, '$& ')),
              )
                .replace(/\s+/gu, ' ')
                .trim();
              cache.set(key, text);
              bytes += Buffer.byteLength(text);
              while (cache.size > 64 || bytes > 16 * 1024 * 1024) {
                const oldest = cache.keys().next().value;
                bytes -= Buffer.byteLength(cache.get(oldest));
                cache.delete(oldest);
              }
            }
            const lower = text.toLocaleLowerCase();
            if (terms.every(term => lower.includes(term))) {
              const position = Math.max(0, lower.indexOf(terms[0]) - 65);
              matches.push({
                bookmarkId: bookmark.id,
                snapshotId: ref.id,
                title: ref.title || bookmark.title,
                capturedAt: ref.capturedAt,
                excerpt: text.slice(position, position + 230),
              });
            }
          } catch {
            unavailable++;
          }
        }),
      );
    const scanned = Math.min(candidates.length, cursor + batch.length);
    return {
      matches: matches.sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt)),
      scanned,
      total: candidates.length,
      unavailable,
      cursor: scanned < candidates.length ? scanned : null,
    };
  };
}
