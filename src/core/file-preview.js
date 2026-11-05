import { downloadWorkspaceFile, mediaContentUrl, getSessionGeneration } from './api.js';
import { S } from './store.js';
import { filePreviewPolicy } from '../shared/file-preview-policy.js';

const previews = new Map();

export function disposeClosedPreviews() {
  for (const [modal, state] of previews) {
    if (!S.ui.auth && S.ui.modals.includes(modal) && state.owner === S.ui.currentUser?.id && state.generation === getSessionGeneration()) continue;
    document.querySelectorAll('[data-file-player]').forEach(player => {
      if (player.dataset.filePlayer === modal.file.id) {
        player.pause();
        player.removeAttribute('src');
        player.load();
      }
    });
    state.controller.abort();
    if (S.ui.modals.includes(modal) && (state.owner !== S.ui.currentUser?.id || state.generation !== getSessionGeneration()))
      S.ui.modals = S.ui.modals.filter(item => item !== modal);
    if (state.url) URL.revokeObjectURL(state.url);
    previews.delete(modal);
  }
}

export function ensureFilePreview(modal, refresh) {
  if (modal.preview) return;
  const policy = filePreviewPolicy(modal.file);
  modal.preview = { kind: policy.kind ? 'loading' : 'unsupported' };
  if (!policy.kind) return;
  const state = { owner: S.ui.currentUser?.id, generation: getSessionGeneration(), controller: new AbortController(), url: null };
  previews.set(modal, state);
  if (['video', 'audio'].includes(policy.kind)) {
    const url = mediaContentUrl(modal.file.id, state.owner);
    if (url) {
      modal.preview = { kind: policy.kind, url };
      return;
    }
    if (modal.file.bytes > policy.maxBytes) {
      modal.preview = { kind: 'unsupported' };
      return;
    }
  }
  queueMicrotask(async () => {
    try {
      const { blob } = await downloadWorkspaceFile(modal.file.id, false, { signal: state.controller.signal, maxBytes: policy.maxBytes });
      if (!previews.has(modal) || !S.ui.modals.includes(modal) || state.owner !== S.ui.currentUser?.id) return;
      if (policy.kind === 'pdf') {
        state.pdf = blob;
        await showPdfPage(modal, state, modal.initialPage || 1);
      } else if (policy.kind === 'text') modal.preview = { kind: 'text', text: await blob.text() };
      else {
        state.url = URL.createObjectURL(blob);
        modal.preview = { kind: ['video', 'audio'].includes(policy.kind) ? policy.kind : 'image', url: state.url };
      }
    } catch (error) {
      if (state.controller.signal.aborted) return;
      modal.preview = { kind: 'error', message: policy.kind === 'pdf' ? 'PDF preview is unavailable. Download the file instead.' : error.message };
    }
    if (previews.has(modal) && S.ui.modals.includes(modal)) refresh();
  });
}

// Preserve a live player through unrelated sync/queue renders, but never across
// closed previews or an account/workspace generation change.
export function preserveFilePlayers() {
  const players = [...document.querySelectorAll('video[data-file-player],audio[data-file-player]')];
  return () => {
    for (const player of players) {
      const replacement = [...document.querySelectorAll('[data-file-player]')].find(
        el => el.dataset.filePlayer === player.dataset.filePlayer && el.getAttribute('src') === player.getAttribute('src'),
      );
      if (replacement) replacement.replaceWith(player);
    }
    document.querySelectorAll('[data-file-player]').forEach(player => {
      if (player.dataset.bound) return;
      player.dataset.bound = 'true';
      player.addEventListener('error', () => {
        const fallback = player.parentElement?.querySelector('[data-media-fallback]');
        if (fallback) fallback.hidden = false;
      });
    });
  };
}

async function showPdfPage(modal, state, number) {
  const { renderPdfPage } = await import('./pdf-preview.js');
  const result = await renderPdfPage(state.pdf, number, state.controller.signal);
  if (!previews.has(modal) || state.owner !== S.ui.currentUser?.id || state.controller.signal.aborted) return;
  if (state.url) URL.revokeObjectURL(state.url);
  state.url = URL.createObjectURL(result.blob);
  modal.preview = { kind: 'pdf', url: state.url, page: result.page, pages: result.pages, text: result.text };
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
