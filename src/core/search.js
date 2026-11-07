import { D, S } from './store.js';
import { searchWorkspace } from '../shared/workspace-search.js';

import { getSessionGeneration, searchWhiteboards, searchWorkspaceFiles, knowledgeCatalogMode } from './api.js';
import { knowledgeServerPage, clearKnowledgeSearch } from './knowledge-server-search.js';
import { whiteboardDemandEnabled } from './whiteboard-catalog-transport.js';
import { render } from '../shell/render.js';
import { fileCatalogInfo } from './file-catalog-state.js';
import { workspaceSyncIsClean } from './workspace-sync.js';
import { remoteSearchSource } from '../shared/remote-search-source.js';
const consumers = new Map();
function sourcesFor(consumer) {
  if (!consumers.has(consumer))
    consumers.set(consumer, {
      boards: remoteSearchSource((options, signal) => searchWhiteboards(options.query, options.limit, options.offset, signal), render),
      files: remoteSearchSource(searchWorkspaceFiles, render),
    });
  return consumers.get(consumer);
}
function clearConsumer(consumer) {
  const sources = consumers.get(consumer);
  sources?.boards.clear();
  sources?.files.clear();
  consumers.delete(consumer);
  clearKnowledgeSearch('workspace:' + consumer);
}
export const clearFileSearch = () => {
  for (const value of consumers.values()) value.files.clear();
};
export const clearWhiteboardSearch = () => {
  for (const key of [...consumers.keys()]) clearConsumer(key);
  clearKnowledgeSearch('workspace');
};
window.addEventListener('smena:upload-scope-change', clearWhiteboardSearch);
window.addEventListener('smena:session-account-changed', clearWhiteboardSearch);
window.addEventListener('smena:rendered', () => {
  if (S.ui.route !== 'search') clearConsumer('page');
  if (!S.ui.palette || S.ui.palette.mode === 'ws' || !S.ui.palette.q?.trim()) clearConsumer('palette');
  if (S.ui.route !== 'knowledge') clearKnowledgeSearch('knowledge');
});
export function searchAll(query, options = {}) {
  const consumer = options.consumer === 'palette' ? 'palette' : 'page';
  const { boards, files } = sourcesFor(consumer);
  const knowledge = query.trim() && knowledgeCatalogMode() ? knowledgeServerPage({ query, mode: 'workspace', channel: 'workspace:' + consumer }) : null;
  const knowledgeIds = knowledge && !knowledge.localOnly ? knowledge.matches || [] : null;
  const result = searchWorkspace(D(), query, { ...options, role: S.ui.currentUser?.role, knowledgeIds });
  result.knowledgeStatus = knowledge?.pending ? 'loading' : knowledge?.error ? 'error' : knowledge?.localOnly ? 'local' : '';
  if (!query.trim()) {
    clearConsumer(consumer);
    return result;
  }
  const session = getSessionGeneration(),
    revision = S.ui.workspaceRevision;
  const scope = JSON.stringify([session, S.ui.activeWorkspace, revision, query]);
  const clean = !S.ui.offline && workspaceSyncIsClean(S.data);
  if (fileCatalogInfo()?.mode === 'demand') {
    if (!clean) {
      files.clear();
      result.fileStatus = 'local';
    } else {
      const offset = options.offsets?.files || 0,
        value = files.query(scope, String(offset), { query, revision, offset });
      result.fileStatus = value.error ? 'error' : value.pending ? 'loading' : '';
      result.fileErrorCode = value.error?.code;
      if (value.data) {
        result.files = value.data.files;
        if (options.totals) options.totals.files = value.data.total;
        if (options.offsets) options.offsets.files = value.data.offset;
        result.filesComplete = true;
      } else result.files = [];
    }
  }
  if (whiteboardDemandEnabled()) {
    if (!clean) {
      boards.clear();
      result.whiteboardStatus = 'local';
    } else {
      const offset = options.offsets?.whiteboards || 0,
        limit = options.limit || 30;
      const value = boards.query(scope, JSON.stringify([offset, limit]), { query, limit, offset });
      result.whiteboardStatus = value.error ? 'error' : value.pending ? 'loading' : '';
      if (value.data) {
        result.whiteboards = value.data.whiteboards;
        if (options.totals) options.totals.whiteboards = value.data.total;
        if (options.offsets) options.offsets.whiteboards = value.data.offset;
      } else result.whiteboards = [];
    }
  }
  return result;
}
