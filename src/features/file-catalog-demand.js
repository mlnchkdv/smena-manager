import { S } from '../core/store.js';
import { getSessionGeneration, queryFileCatalog, loadFileIdentities } from '../core/api.js';
import { fileCatalogInfo } from '../core/file-catalog-transport.js';
import { applyExternalCoreSnapshot } from '../core/bootstrap.js';
import { workspaceSyncIsClean, queueWorkspaceSync } from '../core/workspace-sync.js';
import { render } from '../shell/render.js';
import { A } from '../actions/actions.js';
import { esc } from '../core/utils.js';
import { catalogLoadError } from '../shared/catalog-errors.js';

let loaded,
  pending = '',
  error = '',
  failed = '';
const context = () => `${getSessionGeneration()}:${S.data.ws?.id || S.data.ws?.url}:${S.ui.workspaceRevision}`;
export function demandFilePage(options) {
  if (fileCatalogInfo()?.mode !== 'demand') return null;
  const key = JSON.stringify([context(), options]);
  if (loaded?.key === key) return loaded.page;
  if (pending !== key && failed !== key && !pending) {
    pending = key;
    queueMicrotask(async () => {
      try {
        await queueWorkspaceSync(S.data);
        if (!workspaceSyncIsClean(S.data)) throw new Error('Save changes before loading another file page.');
        const session = getSessionGeneration();
        const page = await queryFileCatalog({ ...options, revision: S.ui.workspaceRevision });
        if (session !== getSessionGeneration()) return;
        const ids = [...new Set([...page.files.map(file => file.id), ...(S.ui.fileSelection || []), ...S.ui.modals.filter(m => m.file).map(m => m.file.id)])];
        const base = structuredClone(S.data);
        const snapshot = await loadFileIdentities(ids, true);
        if (session !== getSessionGeneration()) return;
        if (!workspaceSyncIsClean(S.data)) throw new Error('Save changes before loading another file page.');
        if (snapshot.revision !== page.revision) throw Object.assign(new Error('The workspace changed. Retry loading files.'), { code: 'REVISION_CONFLICT' });
        applyExternalCoreSnapshot(snapshot, base);
        loaded = { key: JSON.stringify([context(), options]), page };
        error = failed = '';
      } catch (cause) {
        if (!cause.staleSession) {
          error = catalogLoadError(cause);
          failed = key;
        }
      } finally {
        pending = '';
        const input = document.activeElement;
        const draft = ['files-page-jump', 'files-folder-page-jump'].includes(input?.id) ? { id: input.id, value: input.value } : null;
        render();
        // A completed query must not erase a page number typed while the
        // response was in flight, before the user presses Enter.
        if (draft) {
          const target = document.getElementById(draft.id);
          if (target) target.value = draft.value;
        }
      }
    });
  }
  return { loading: true, error: failed === key ? error : '' };
}
export function filePagePending(page) {
  return `<div class="panel" style="padding:24px" role="status"><p>${esc(page.error || 'Loading files…')}</p>${page.error ? '<button class="btn btn-secondary" data-a="retryFileCatalog">Try again</button>' : ''}</div>`;
}
A.retryFileCatalog = () => {
  failed = error = '';
  render();
};
export async function ensureFileIdentities(ids) {
  await queueWorkspaceSync(S.data);
  if (!workspaceSyncIsClean(S.data)) throw new Error('Save changes before loading another file page.');
  const session = getSessionGeneration(),
    base = structuredClone(S.data);
  const snapshot = await loadFileIdentities(ids);
  if (session !== getSessionGeneration() || !workspaceSyncIsClean(S.data)) throw new Error('The workspace changed. Retry loading files.');
  applyExternalCoreSnapshot(snapshot, base);
}
