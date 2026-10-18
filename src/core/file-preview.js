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
      if (policy.kind === 'pdf') {
        state.pdf = blob;
        await showPdfPage(modal, state, 1);
      } else if (policy.kind === 'text') modal.preview = { kind: 'text', text: await blob.text() };
      else {
        state.url = URL.createObjectURL(blob);
        modal.preview = { kind: 'image', url: state.url };
      }
    } catch (error) {
      if (state.controller.signal.aborted) return;
      modal.preview = { kind: 'error', message: policy.kind === 'pdf' ? 'PDF preview is unavailable. Download the file instead.' : error.message };
    }
    if (previews.has(modal) && S.ui.modals.includes(modal)) refresh();
  });
}

async function showPdfPage(modal, state, number) {
  const { renderPdfPage } = await import('./pdf-preview.js');
  const result = await renderPdfPage(state.pdf, number, state.controller.signal);
  if (!previews.has(modal) || state.owner !== S.ui.currentUser?.id || state.controller.signal.aborted) return;
  if (state.url) URL.revokeObjectURL(state.url);
  state.url = URL.createObjectURL(result.blob);
  modal.preview = { kind: 'pdf', url: state.url, page: result.page, pages: result.pages };
}

export async function changePdfPreviewPage(modal, number, refresh) {
  const state = previews.get(modal);
  if (!state?.pdf || state.busy || modal.preview?.kind !== 'pdf') return;
  state.busy = true;
  modal.preview.loading = true;
  refresh();
  try {
    await showPdfPage(modal, state, number);
  } catch {
    if (!state.controller.signal.aborted) modal.preview = { kind: 'error', message: 'PDF preview is unavailable. Download the file instead.' };
  } finally {
    state.busy = false;
    if (previews.has(modal) && S.ui.modals.includes(modal)) refresh();
  }
}
