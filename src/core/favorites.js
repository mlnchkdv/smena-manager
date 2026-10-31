import { S } from './store.js';
import { favoriteFlag } from '../shared/personal-favorites.js';
export const isFavorite = (kind, record) => favoriteFlag(S.prefs.favorites, kind, record);
