import { D, S } from './store.js';
import { createFileArchivePlan, STREAM_ZIP_POLICY } from '../shared/file-archive-policy.js';
import { toast } from '../ui/toast.js';
import { getActiveWorkspace, getSessionGeneration, prepareFileArchive } from './api.js';
import { render } from '../shell/render.js';

const scope = () => JSON.stringify([S.ui.currentUser?.id, D().ws?.id || D().ws?.url, getSessionGeneration()]);
export async function streamSelectedFiles(ids = [...(S.ui.fileSelection || [])]) {
  // An action handler may pass its clicked DOM element, not a file ID list.
  if (!Array.isArray(ids)) ids = [...(S.ui.fileSelection || [])];
  if (S.ui.fileDownload && !['ready', 'expired'].includes(S.ui.fileDownload.phase)) return;
  if (S.ui.fileNativeTransfer?.phase === 'preparing') return;
  const state = { ids, owner: scope(), controller: new AbortController(), phase: 'preparing' };
  S.ui.fileNativeTransfer = state;
  render();
  try {
    const plan = createFileArchivePlan(D(), ids, S.ui.currentUser?.role, STREAM_ZIP_POLICY);
    const prepared = await prepareFileArchive(ids, S.ui.workspaceRevision, state.controller.signal);
    if (state.owner !== scope() || S.ui.fileNativeTransfer !== state || state.controller.signal.aborted) return;
    Object.assign(state, {
      phase: 'ready',
      revision: prepared.revision,
      expiresAt: Date.now() + 60000,
      identities: plan.map(item => [item.file.id, item.file.storageName, item.file.storageFileId]),
    });
  } catch (error) {
    if (state.owner !== scope() || S.ui.fileNativeTransfer !== state || state.controller.signal.aborted) return;
    state.phase = 'failed';
    state.error =
      error.status === 409
        ? 'The selected files changed. Select them again.'
        : error.status === 429
          ? 'Another archive is being downloaded. Try again later.'
          : 'Unable to prepare the download. Check connection and access, or select a smaller batch.';
  } finally {
    if (S.ui.fileNativeTransfer === state) render();
  }
}

// A second explicit gesture preserves native downloads on mobile without opening
// an API error page before the authenticated preflight has finished.
export function startPreparedFileStream() {
  const state = S.ui.fileNativeTransfer;
  if (!state || state.owner !== scope() || state.phase !== 'ready') return;
  try {
    if (state.expiresAt <= Date.now()) {
      state.phase = 'expired';
      return render();
    }
    const plan = createFileArchivePlan(D(), state.ids, S.ui.currentUser?.role, STREAM_ZIP_POLICY);
    if (JSON.stringify(plan.map(item => [item.file.id, item.file.storageName, item.file.storageFileId])) !== JSON.stringify(state.identities))
      throw Error('The selected files changed. Select them again.');
    const form = document.createElement('form');
    form.method = 'POST';
    form.target = '_blank';
    form.rel = 'noopener';
    form.action = `/api/files/archive?account=${encodeURIComponent(S.ui.currentUser.id)}&workspace=${encodeURIComponent(getActiveWorkspace())}`;
    for (const [name, value] of Object.entries({ ids: JSON.stringify(state.ids), revision: String(state.revision) })) {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = value;
      form.append(input);
    }
    document.body.append(form);
    form.submit();
    form.remove();
    state.phase = 'browser';
    render();
  } catch (error) {
    toast(error.message, { kind: 'err' });
  }
}

export function cancelFileStream() {
  S.ui.fileNativeTransfer?.controller.abort();
  S.ui.fileNativeTransfer = null;
  render();
}
