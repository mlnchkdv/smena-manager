import { S } from './store.js';
import { searchKnowledgePage, getSessionGeneration } from './api.js';
import { workspaceSyncState } from './workspace-sync.js';
import { render } from '../shell/render.js';
let state = null,
  timer;
export function knowledgeServerPage(options) {
  const sync = workspaceSyncState().documents.knowledge;
  if (!options.query || options.folder === 'recent' || S.ui.knowledgeDirty || sync.hasPending || sync.hasActive || sync.hasConflict || S.ui.offline)
    return null;
  const generation = getSessionGeneration(),
    owner = S.ui.currentUser?.id,
    revision = S.ui.documentRevisions.knowledge;
  const key = JSON.stringify([generation, owner, revision, options]);
  if (state?.key === key) return state.result;
  clearTimeout(timer);
  state = { key, result: null };
  timer = setTimeout(async () => {
    try {
      const result = await searchKnowledgePage(options);
      if (state?.key !== key || getSessionGeneration() !== generation || owner !== S.ui.currentUser?.id || revision !== S.ui.documentRevisions.knowledge)
        return;
      if (result.revision !== revision) return;
      state.result = result;
      render();
    } catch {
      /* Local search remains available offline or on older deployments. */
    }
  }, 250);
  return null;
}
