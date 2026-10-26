import { D, S } from './store.js';
import { searchWorkspace } from '../shared/workspace-search.js';

export const searchAll = (query, options = {}) => searchWorkspace(D(), query, { ...options, role: S.ui.currentUser?.role });
