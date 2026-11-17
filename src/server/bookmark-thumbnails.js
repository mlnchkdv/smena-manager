import { fetchPublicImage, fetchPublicPage, pageMetadata } from './web-page-fetch.js';

// Cache only public raster data, never credentials or private page contents.
// Permissions are checked by the router on every request, including cache hits.
export function createBookmarkThumbnailLoader({ fetchPage = fetchPublicPage, fetchImage = fetchPublicImage, now = Date.now } = {}) {
  const cache = new Map();
  const pending = new Map();
  const waiting = [];
  let active = 0;
  const ttl = 60 * 60 * 1000;
  let bytes = 0;
  function remember(key, result) {
    const item = { result, until: now() + (result ? ttl : 5 * 60 * 1000) };
    cache.set(key, item);
    bytes += result?.body.length || 0;
    while (cache.size > 64 || bytes > 24 * 1024 * 1024) {
      const first = cache.keys().next().value;
      bytes -= cache.get(first).result?.body.length || 0;
      cache.delete(first);
    }
    return result;
  }
  return async bookmark => {
    // Do not accept arbitrary client image URLs. Discover the image from the
    // bookmark's current public page; each network hop uses pinned public DNS.
    const key = bookmark.url;
    const cached = cache.get(key);
    if (cached && cached.until > now()) return cached.result;
    if (cached) {
      bytes -= cached.result?.body.length || 0;
      cache.delete(key);
    }
    if (pending.has(key)) return pending.get(key);
    if (pending.size >= 100) return null;
    const work = Promise.resolve().then(async () => {
      if (active >= 6) await new Promise(resolve => waiting.push(resolve));
      else active++;
      try {
        const page = await fetchPage(bookmark.url, { signal: AbortSignal.timeout(10000) });
        const imageUrl = pageMetadata(page.html, page.url).imageUrl;
        return remember(key, imageUrl ? await fetchImage(imageUrl, { signal: AbortSignal.timeout(10000) }) : null);
      } catch {
        return remember(key, null);
      } finally {
        if (waiting.length) waiting.shift()();
        else active--;
        pending.delete(key);
      }
    });
    pending.set(key, work);
    return work;
  };
}
