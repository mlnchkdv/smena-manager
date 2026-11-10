import { S } from '../core/store.js';
import { getSessionGeneration, queryFileCatalog, queryFileFolderCounts, loadFileIdentities } from '../core/api.js';
import { filePageOptions, createFolderCountCache } from '../shared/file-page-cache.js';
import { fileCatalogInfo } from '../core/file-catalog-transport.js';
import { applyExternalCoreSnapshot } from '../core/bootstrap.js';
import { workspaceSyncIsClean, queueWorkspaceSync } from '../core/workspace-sync.js';
import { render } from '../shell/render.js';
import { A } from '../actions/actions.js';
import { catalogLoadError } from '../shared/catalog-errors.js';
import { backgroundRender } from './background-render.js';
import { readCatalogWithRevisionRefresh } from '../shared/catalog-revision-retry.js';
import { waitForPersonalPreferences } from '../core/personal-preferences.js';

let loaded,
  pending = '',
  error = '',
  failed = '';
const ownerScope = () => JSON.stringify([getSessionGeneration(), S.ui.currentUser?.id, S.ui.currentUser?.role, S.data.me, S.data.ws?.id || S.data.ws?.url]);
const context = () => JSON.stringify([ownerScope(), S.ui.workspaceRevision]);
const counts = createFolderCountCache();
let countsPending = '',
  countsFailure = '';
function pageWithCounts(page, options) {
  const scope = context(),
    folders = options.countFolders || [],
    missing = counts.missing(scope, folders);
  const requestKey = JSON.stringify([scope, options.context, missing]);
  if (missing.length && !countsPending && countsFailure !== requestKey) {
    countsPending = requestKey;
    queueMicrotask(async () => {
      try {
        if (context() !== scope) return;
        const reply = await queryFileFolderCounts({ revision: S.ui.workspaceRevision, context: options.context, countFolders: missing });
        if (context() !== scope) return;
        if (reply.revision !== S.ui.workspaceRevision) throw Object.assign(Error('Catalog changed'), { code: 'REVISION_CONFLICT' });
        counts.seed(scope, reply.folderCounts);
        countsFailure = '';
      } catch (cause) {
        if (context() !== scope || cause.staleSession) return;
        countsFailure = requestKey;
        if (cause.code === 'REVISION_CONFLICT') {
          loaded = null;
          counts.clear();
          if (workspaceSyncIsClean(S.data)) {
            const base = structuredClone(S.data);
            const snapshot = await loadFileIdentities([]).catch(() => null);
            if (snapshot && context() === scope && workspaceSyncIsClean(S.data)) applyExternalCoreSnapshot(snapshot, base);
          }
        }
        if (cause.status === 401 || cause.status === 403 || cause.code === 'AUTH_REQUIRED') {
          loaded = null;
          counts.clear();
          error = catalogLoadError(cause);
          failed = JSON.stringify([context(), filePageOptions(options)]);
        }
      } finally {
        countsPending = '';
        backgroundRender(render);
      }
    });
  }
  return {
    ...page,
    folderCounts: counts.read(scope, folders),
    countsLoading: !!missing.length && countsFailure !== requestKey,
    countsError: !!missing.length && countsFailure === requestKey,
  };
}
export function demandFilePage(options) {
  if (fileCatalogInfo()?.mode !== 'demand') return null;
  const rowOptions = filePageOptions(options);
  const key = JSON.stringify([context(), rowOptions]);
  const scope = ownerScope(),
    query = JSON.stringify(rowOptions);
  if (loaded?.key === key) return pageWithCounts(loaded.page, options);
  if (pending !== key && failed !== key && !pending) {
    pending = key;
    queueMicrotask(async () => {
      try {
        await queueWorkspaceSync(S.data);
        await waitForPersonalPreferences();
        if (ownerScope() !== scope) return;
        if (!workspaceSyncIsClean(S.data)) throw new Error('Save changes before loading another file page.');
        const session = getSessionGeneration();
        await readCatalogWithRevisionRefresh(
          async () => {
            const page = await queryFileCatalog({ ...options, revision: S.ui.workspaceRevision });
            if (session !== getSessionGeneration()) return;
            const ids = [
              ...new Set([...page.files.map(file => file.id), ...(S.ui.fileSelection || []), ...S.ui.modals.filter(m => m.file).map(m => m.file.id)]),
            ];
            const base = structuredClone(S.data);
            const snapshot = await loadFileIdentities(ids, true);
            if (session !== getSessionGeneration()) return;
            if (!workspaceSyncIsClean(S.data)) throw new Error('Save changes before loading another file page.');
            if (snapshot.revision !== page.revision)
              throw Object.assign(new Error('The workspace changed. Retry loading files.'), { code: 'REVISION_CONFLICT' });
            applyExternalCoreSnapshot(snapshot, base);
            counts.seed(context(), page.folderCounts);
            loaded = { key: JSON.stringify([context(), rowOptions]), scope, query, page, revision: S.ui.workspaceRevision };
            error = failed = '';
          },
          async () => {
            const base = structuredClone(S.data);
            const snapshot = await loadFileIdentities([]);
            if (session !== getSessionGeneration()) return;
            if (!workspaceSyncIsClean(S.data)) throw new Error('Save changes before loading another file page.');
            applyExternalCoreSnapshot(snapshot, base);
          },
          () => session === getSessionGeneration() && workspaceSyncIsClean(S.data),
        );
      } catch (cause) {
        if (!cause.staleSession) {
          if (cause.status === 401 || cause.status === 403 || cause.code === 'AUTH_REQUIRED') loaded = null;
          error = catalogLoadError(cause);
          failed = key;
        }
      } finally {
        pending = '';
        backgroundRender(() => {
          const input = document.activeElement;
          const draft = ['files-page-jump', 'files-folder-page-jump'].includes(input?.id) ? { id: input.id, value: input.value } : null;
          render();
          // A completed query must not erase a page number typed while the
          // response was in flight, before the user presses Enter.
          if (draft) {
            const target = document.getElementById(draft.id);
            if (target) target.value = draft.value;
          }
        });
      }
    });
  }
  const previous = loaded?.scope === scope && loaded.revision === S.ui.workspaceRevision && loaded.query === query ? loaded.page : null;
  return { ...(previous || {}), loading: true, refreshing: !!previous, error: failed === key ? error : '' };
}
A.retryFileCatalog = () => {
  failed = error = '';
  countsFailure = '';
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
