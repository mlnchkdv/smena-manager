export const FAVORITE_LIMIT = 500;
let cachedRaw,
  cachedFavorites = new Map();
const kinds = new Set(['task', 'project', 'note', 'bookmark', 'file', 'whiteboard']);
export function validFavorites(value) {
  return (
    Array.isArray(value) &&
    value.length <= FAVORITE_LIMIT &&
    new Set(value.map(item => item?.[0])).size === value.length &&
    value.every(
      item =>
        Array.isArray(item) &&
        item.length === 2 &&
        typeof item[0] === 'string' &&
        item[0].length <= 220 &&
        kinds.has(item[0].split(':')[0]) &&
        item[0].includes(':') &&
        item[0].split(':').slice(1).join(':').length > 0 &&
        typeof item[1] === 'boolean',
    )
  );
}
export function favoriteEntries(raw) {
  try {
    const entries = JSON.parse(raw || '[]');
    return validFavorites(entries) ? entries : [];
  } catch {
    return [];
  }
}
export function favoriteFlag(raw, kind, record) {
  if (!record) return false;
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedFavorites = new Map(favoriteEntries(raw));
  }
  const key = `${kind}:${record.id}`;
  // Non-destructive migration: old shared flags remain a starting point only.
  // An explicit personal true/false overrides them without changing coworkers.
  return cachedFavorites.has(key) ? cachedFavorites.get(key) : kind === 'note' ? record.favorite === true : record.fav === true;
}
export function changedFavorite(raw, kind, record) {
  const entries = new Map(favoriteEntries(raw)),
    key = `${kind}:${record.id}`;
  const selected = !favoriteFlag(raw, kind, record);
  const legacy = kind === 'note' ? record.favorite === true : record.fav === true;
  if (!selected && !legacy) entries.delete(key);
  else entries.set(key, selected);
  if (!validFavorites([...entries])) throw new RangeError('Favorite limit reached. Remove an existing favorite first.');
  return { value: JSON.stringify([...entries]), selected };
}
