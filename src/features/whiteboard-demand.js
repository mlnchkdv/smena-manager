import { S } from '../core/store.js';
import { getSessionGeneration, loadWhiteboardDocument } from '../core/api.js';
import { whiteboardBodyAvailable } from '../core/whiteboard-catalog-transport.js';
import { applyExternalCoreSnapshot } from '../core/bootstrap.js';
import { queueWorkspaceSync, workspaceSyncIsClean } from '../core/workspace-sync.js';
import { render } from '../shell/render.js';
import { A } from '../actions/actions.js';
let pending = '',
  failed = '';
const key = id => `${getSessionGeneration()}:${S.ui.activeWorkspace}:${id}:${S.ui.workspaceRevision}`;
export function demandWhiteboard(id) {
  if (whiteboardBodyAvailable(id)) return null;
  const scope = key(id);
  if (!pending && failed !== scope) {
    pending = scope;
    queueMicrotask(async () => {
      try {
        await queueWorkspaceSync(S.data);
        if (!workspaceSyncIsClean(S.data)) throw new Error('Save changes first.');
        const session = getSessionGeneration(),
          base = structuredClone(S.data);
        const snapshot = await loadWhiteboardDocument(id);
        if (session !== getSessionGeneration() || !workspaceSyncIsClean(S.data)) throw new Error('The workspace changed.');
        applyExternalCoreSnapshot(snapshot, base);
        failed = '';
      } catch {
        failed = scope;
      } finally {
        pending = '';
        render();
      }
    });
  }
  return { error: failed === scope };
}
A.retryWhiteboardContent = () => {
  failed = '';
  render();
};
