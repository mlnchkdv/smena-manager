let providers = new WeakMap();
const budget = 24 * 1024 * 1024;
const lru = new Map();
let processBytes = 0;
export function searchCache(storage) {
  if (!providers.has(storage)) providers.set(storage, { entries: new Map(), bytes: 0 });
  return providers.get(storage);
}
export function cacheSearchValue(storage, key, value, bytes) {
  if (bytes > budget) return;
  const cache = searchCache(storage);
  if (cache.entries.has(key)) return;
  const entry = { value, bytes, key, owner: new WeakRef(storage) };
  cache.entries.set(key, entry);
  cache.bytes += bytes;
  processBytes += bytes;
  lru.set(entry, true);
  while (processBytes > budget && lru.size) {
    const oldest = lru.keys().next().value;
    lru.delete(oldest);
    processBytes -= oldest.bytes;
    const owner = oldest.owner.deref(),
      previous = owner && providers.get(owner);
    if (previous?.entries.get(oldest.key) === oldest) {
      previous.entries.delete(oldest.key);
      previous.bytes -= oldest.bytes;
    }
  }
}
export function cachedSearchValue(storage, key) {
  const entry = searchCache(storage).entries.get(key);
  if (!entry) return undefined;
  lru.delete(entry);
  lru.set(entry, true);
  return entry.value;
}
export function resetKnowledgeSearchCache() {
  providers = new WeakMap();
  lru.clear();
  processBytes = 0;
}
