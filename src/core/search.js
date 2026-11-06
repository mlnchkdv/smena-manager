import { D, S } from './store.js';
import { searchWorkspace } from '../shared/workspace-search.js';

import { getSessionGeneration, searchWhiteboards, knowledgeCatalogMode } from './api.js';
import { knowledgeServerPage, clearKnowledgeSearch } from './knowledge-server-search.js';
import { whiteboardDemandEnabled } from './whiteboard-catalog-transport.js';
import { render } from '../shell/render.js';
const boards = new Map();
export const clearWhiteboardSearch = () => {
  boards.clear();
  clearKnowledgeSearch('workspace');
};
export function searchAll(query, options = {}) {
  const knowledge = query.trim() && knowledgeCatalogMode() ? knowledgeServerPage({ query, mode: 'workspace' }) : null;
  const knowledgeIds = knowledge && !knowledge.localOnly ? knowledge.matches || [] : null;
  const result = searchWorkspace(D(), query, { ...options, role: S.ui.currentUser?.role, knowledgeIds });
  result.knowledgeStatus = knowledge?.pending ? 'loading' : knowledge?.error ? 'error' : knowledge?.localOnly ? 'local' : '';
  if (!query.trim() || !whiteboardDemandEnabled()) return result;
  const session = getSessionGeneration(),
    revision = S.ui.workspaceRevision;
  const key = JSON.stringify([session, revision, query, options.limit || 30, options.offsets?.whiteboards || 0]);
  const value = boards.get(key);
  result.whiteboardStatus = value?.error ? 'error' : !value?.data ? 'loading' : '';
  if (value?.data) {
    result.whiteboards = value.data.whiteboards;
    if (options.totals) options.totals.whiteboards = value.data.total;
    if (options.offsets) options.offsets.whiteboards = value.data.offset;
  } else if (!value) {
    boards.set(key, { pending: true });
    while (boards.size > 12) boards.delete(boards.keys().next().value);
    queueMicrotask(async () => {
      try {
        const data = await searchWhiteboards(query, options.limit || 30, options.offsets?.whiteboards || 0);
        if (session !== getSessionGeneration()) return;
        boards.set(key, { data });
      } catch {
        boards.set(key, { error: true });
      }
      if (session === getSessionGeneration() && revision === S.ui.workspaceRevision) render();
    });
  }
  return result;
}
