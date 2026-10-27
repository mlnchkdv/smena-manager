import { D, S } from './store.js';
import { searchHistoryKey, readSearchHistory, writeSearchHistory } from '../shared/search-history.js';

const key = () => searchHistoryKey(S.ui.currentUser?.id, D().ws.id || D().ws.url);
const storage = () => {
  try {
    return localStorage;
  } catch {
    return null;
  }
};
export const recentSearches = () => readSearchHistory(storage(), key());
export function rememberSearch(query) {
  writeSearchHistory(storage(), key(), [query, ...recentSearches().filter(value => value !== query)]);
}
export const clearSearchHistory = () => writeSearchHistory(storage(), key(), []);
export function resetSearchSession() {
  S.ui.searchQ = '';
  S.ui.searchCat = 'all';
  S.ui.searchOffsets = {};
  S.ui.searchPageContext = null;
}
