let providers = new WeakMap();
const budget = 24 * 1024 * 1024;
export function searchCache(storage) {
  if (!providers.has(storage)) providers.set(storage, { entries: new Map(), bytes: 0 });
  return providers.get(storage);
}
export function cacheSearchValue(storage, key, value, bytes) {
  if (bytes > budget) return;
  const cache = searchCache(storage);
  if (cache.entries.has(key)) return;
  cache.entries.set(key, { value, bytes });
  cache.bytes += bytes;
  while (cache.bytes > budget && cache.entries.size > 1) {
    const first = cache.entries.keys().next().value;
    cache.bytes -= cache.entries.get(first).bytes;
    cache.entries.delete(first);
  }
}
export const cachedSearchValue = (storage, key) => searchCache(storage).entries.get(key)?.value;
export function resetKnowledgeSearchCache() {
  providers = new WeakMap();
}
