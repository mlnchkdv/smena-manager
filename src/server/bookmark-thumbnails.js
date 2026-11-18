import { fetchPublicImage, fetchPublicPage, pageMetadata } from './web-page-fetch.js';

// Archived covers are immutable, workspace-scoped and read only after route auth.
// Prefer a real saved raster image over a new request to a possibly changed site.
export function createSavedBookmarkThumbnailLoader(read) {
  const cache = new Map();
  const pending = new Map();
  let bytes = 0;
  return async (bookmark, workspace) => {
    const ref = bookmark.pageSnapshots?.find(row => row.format === 'html' && !row.isArchived) || bookmark.pageSnapshots?.find(row => row.format === 'html');
    if (!ref) return null;
    const key = workspace + ':' + bookmark.id + ':' + ref.sha256;
    if (cache.has(key)) return cache.get(key);
    if (pending.has(key)) return pending.get(key);
    if (pending.size >= 16) return null;
    const work = (async () => {
      let result = null;
      try {
        const page = await read(bookmark, ref.id);
        if (typeof page.screenshot === 'string' && page.screenshot.length <= 4 * 1024 * 1024) {
          const body = Buffer.from(page.screenshot, 'base64');
          if (body[0] === 255 && body[1] === 216 && body[2] === 255) result = { body, contentType: 'image/jpeg' };
        }
        for (const match of (page.document || '').matchAll(/<img\b[^>]*\bsrc="data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)"/gi)) {
          if (result) break;
          if (match[2].length > 4 * 1024 * 1024) continue;
          const body = Buffer.from(match[2], 'base64');
          // Tiny tracking pixels make poor covers; keep looking for content.
          if (body.length < 128) continue;
          result = { contentType: match[1], body };
          break;
        }
      } catch {
        // A missing or unverifiable archive never bypasses its integrity checks.
      }
      cache.set(key, result);
      bytes += result?.body.length || 0;
      while (cache.size > 64 || bytes > 16 * 1024 * 1024) {
        const first = cache.keys().next().value;
        bytes -= cache.get(first)?.body.length || 0;
        cache.delete(first);
      }
      return result;
    })().finally(() => pending.delete(key));
    pending.set(key, work);
    return work;
  };
}

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
