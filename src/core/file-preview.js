import { downloadWorkspaceFile } from './api.js';
import { S } from './store.js';
import { filePreviewPolicy } from '../shared/file-preview-policy.js';

const previews = new Map();

export function disposeClosedPreviews() {
  for (const [modal, state] of previews) {
    if (!S.ui.auth && S.ui.modals.includes(modal) && state.owner === S.ui.currentUser?.id) continue;
    state.controller.abort();
    if (state.url) URL.revokeObjectURL(state.url);
    previews.delete(modal);
  }
}

export function ensureFilePreview(modal, refresh) {
  if (modal.preview) return;
  const policy = filePreviewPolicy(modal.file);
  modal.preview = { kind: policy.kind ? 'loading' : 'unsupported' };
  if (!policy.kind) return;
  const state = { owner: S.ui.currentUser?.id, controller: new AbortController(), url: null };
  previews.set(modal, state);
  queueMicrotask(async () => {
    try {
      const { blob } = await downloadWorkspaceFile(modal.file.id, false, { signal: state.controller.signal, maxBytes: policy.maxBytes });
      if (!previews.has(modal) || !S.ui.modals.includes(modal) || state.owner !== S.ui.currentUser?.id) return;
      if (policy.kind === 'text') modal.preview = { kind: 'text', text: await blob.text() };
      else {
        state.url = URL.createObjectURL(blob);
        modal.preview = { kind: 'image', url: state.url };
      }
    } catch (error) {
      if (state.controller.signal.aborted) return;
      modal.preview = { kind: 'error', message: error.message };
    }
    if (previews.has(modal) && S.ui.modals.includes(modal)) refresh();
  });
}
