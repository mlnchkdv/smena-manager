import { D, S } from './store.js';
import { searchWorkspace } from '../shared/workspace-search.js';

export const searchAll = query => searchWorkspace(D(), query, { role: S.ui.currentUser?.role });
