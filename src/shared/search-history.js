const LIMIT = 5;
const QUERY_LIMIT = 200;
export const searchHistoryKey = (user, workspace) => (user && workspace ? `smena.search.v1:${JSON.stringify([String(user), String(workspace)])}` : null);
export function normalizeSearchHistory(value) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .filter(q => typeof q === 'string')
        .map(q => q.trim().slice(0, QUERY_LIMIT))
        .filter(Boolean),
    ),
  ].slice(0, LIMIT);
}
export function readSearchHistory(storage, key) {
  if (!key) return [];
  try {
    return normalizeSearchHistory(JSON.parse(storage.getItem(key) || '[]'));
  } catch {
    return [];
  }
}
export function writeSearchHistory(storage, key, value) {
  if (!key) return false;
  try {
    storage.setItem(key, JSON.stringify(normalizeSearchHistory(value)));
    return true;
  } catch {
    return false;
  }
}
