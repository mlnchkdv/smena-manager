import { downloadWorkspaceFile, mediaContentUrl, getSessionGeneration, getSessionToken, getActiveWorkspace } from './api.js';
import { S, canSee, proj } from './store.js';
import { filePreviewPolicy } from '../shared/file-preview-policy.js';
import { uid } from './utils.js';
import { clampedMediaStart } from '../shared/whiteboard-media.js';
import { isRussian } from './i18n.js';

const previews = new Map();

window.addEventListener('message', event => {
  if (event.origin !== 'null' || !event.data?.type?.startsWith?.('smena:reader-')) return;
  const modal = S.ui.modals.at(-1);
  if (modal?.preview?.kind !== 'html') return;
  const frame = document.querySelector('.html-reader iframe');
  if (!frame || frame.contentWindow !== event.source) return;
  const { type, path, offset, y } = event.data;
  if (type === 'smena:reader-exit-focus' && document.activeElement === frame) {
    frame.closest('.html-reader')?.querySelector('.html-reader-close')?.focus();
  } else if (type === 'smena:reader-ready' && modal.readingPosition) {
    event.source.postMessage({ type: 'smena:reader-restore', ...modal.readingPosition }, '*');
  } else if (
    type === 'smena:reader-position' &&
    Array.isArray(path) &&
    path.length <= 6 &&
    path.every(key => typeof key === 'string' && key.length <= 1800) &&
    Number.isFinite(offset) &&
    Number.isFinite(y)
  ) {
    modal.readingPosition = { path, offset, y };
  }
});

export async function imagePreviewSize(url) {
  const image = new Image();
  image.src = url;
  await image.decode();
  if (!image.naturalWidth || !image.naturalHeight) throw new Error('Invalid image dimensions.');
  return { width: image.naturalWidth, height: image.naturalHeight };
}

function previewScopeCurrent(state) {
  return !S.ui.auth && state.owner === S.ui.currentUser?.id && state.generation === getSessionGeneration();
}

function fileAccessLost(modal) {
  const data = S.data;
  const file = data.files.find(item => item.id === modal.file.id) || modal.file;
  // A demand-loaded page can evict a readable file. Only a known deletion or
  // changed project access invalidates an open preview.
  return Boolean((file.project && !canSee(proj(file.project))) || data.trash?.some(item => item.kind === 'file' && item.data?.file?.id === file.id));
}

export function disposeClosedPreviews() {
  for (const [modal, state] of previews) {
    const open = S.ui.modals.includes(modal);
    const current = previewScopeCurrent(state);
    if (open && current && !fileAccessLost(modal)) continue;
    if (open && current) modal.preview = { kind: 'unavailable' };
    document.querySelectorAll('[data-file-player]').forEach(player => {
      if (player.dataset.filePlayer === modal.file.id && player.dataset.filePreviewKey === modal.previewInstance) {
        player.pause();
        player.removeAttribute('src');
        player.load();
      }
    });
    state.controller.abort();
    if (open && !current) S.ui.modals = S.ui.modals.filter(item => item !== modal);
    if (state.url) URL.revokeObjectURL(state.url);
    if (state.canvas) state.canvas.width = state.canvas.height = 0;
    previews.delete(modal);
  }
}

export function ensureFilePreview(modal, refresh, { measureImage = false } = {}) {
  modal.previewInstance ||= uid('preview');
  if (modal.preview) return;
  if (fileAccessLost(modal)) {
    modal.preview = { kind: 'unavailable' };
    return;
  }
  const policy = filePreviewPolicy(modal.file);
  modal.preview = { kind: policy.kind ? 'loading' : 'unsupported' };
  if (!policy.kind) return;
  const state = { owner: S.ui.currentUser?.id, generation: getSessionGeneration(), controller: new AbortController(), url: null };
  previews.set(modal, state);
  if (policy.kind === 'html' && getSessionToken() === 'cookie') {
    modal.preview = {
      kind: 'html',
      url: `/api/html-previews/${encodeURIComponent(modal.file.id)}?workspace=${encodeURIComponent(getActiveWorkspace())}&account=${encodeURIComponent(state.owner)}`,
    };
    return;
  }
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
  const signal = state.controller.signal;
  // Start the renderer while the authorized content request is in flight. Each
  // preview owns its first-page worker, including when either operation fails.
  const workerReady = policy.kind === 'pdf' ? import('./pdf-preview.js').then(module => module.startPdfWorker(signal)) : null;
  async function load() {
    try {
      const [{ blob }, worker] = await Promise.all([downloadWorkspaceFile(modal.file.id, false, { signal, maxBytes: policy.maxBytes }), workerReady]);
      if (!previews.has(modal) || !S.ui.modals.includes(modal) || !previewScopeCurrent(state)) return;
      if (policy.kind === 'pdf') {
        state.pdf = blob;
        await showPdfPage(modal, state, modal.initialPage || 1, refresh, worker);
        return;
      } else if (['text', 'html'].includes(policy.kind)) modal.preview = { kind: 'text', text: await blob.text() };
      else {
        state.url = URL.createObjectURL(blob);
        const size = measureImage && policy.kind === 'image' ? await imagePreviewSize(state.url) : null;
        if (state.controller.signal.aborted) return;
        modal.preview = { kind: ['video', 'audio'].includes(policy.kind) ? policy.kind : 'image', url: state.url, size };
      }
    } catch (error) {
      if (state.controller.signal.aborted) return;
      modal.preview = [403, 404].includes(error.status)
        ? { kind: 'unavailable' }
        : { kind: 'error', message: policy.kind === 'pdf' ? 'PDF preview is unavailable. Download the file instead.' : error.message };
    } finally {
      // A denied or cancelled download can settle before the worker starts.
      if (workerReady)
        void workerReady.then(
          worker => worker.destroy(),
          () => {},
        );
    }
    if (previews.has(modal) && S.ui.modals.includes(modal)) refresh();
  }
  void load();
}

// Preserve a live player through unrelated sync/queue renders, but never across
// closed previews or an account/workspace generation change.
export function preserveFilePlayers() {
  const players = [...document.querySelectorAll('video[data-file-player],audio[data-file-player]')];
  return () => {
    for (const player of players) {
      const replacement = [...document.querySelectorAll('[data-file-player]')].find(
        el =>
          el.dataset.filePreviewKey === player.dataset.filePreviewKey &&
          el.dataset.filePlayer === player.dataset.filePlayer &&
          el.getAttribute('src') === player.getAttribute('src'),
      );
      if (replacement) replacement.replaceWith(player);
    }
    document.querySelectorAll('[data-file-player]').forEach(player => {
      const unavailable = () => {
        player.dataset.seekUnavailable = 'true';
        const hint = player.parentElement?.querySelector('[data-media-start-status]');
        if (hint)
          hint.textContent = isRussian()
            ? 'Не удалось перейти к сохранённой позиции. Используйте управление проигрывателем.'
            : 'The saved start position is unavailable. Use the player controls.';
      };
      if (player.dataset.seekUnavailable) unavailable();
      if (player.dataset.bound) return;
      player.dataset.bound = 'true';
      if (player.hasAttribute('data-media-start')) {
        const seek = () => {
          const position = clampedMediaStart(Number(player.dataset.mediaStart), player.duration);
          if (position == null) return unavailable();
          try {
            player.currentTime = position;
          } catch {
            unavailable();
          }
        };
        player.addEventListener('loadedmetadata', seek, { once: true });
        if (player.readyState >= 1) seek();
      }
      player.addEventListener('error', () => {
        const fallback = player.parentElement?.querySelector('[data-media-fallback]');
        if (fallback) fallback.hidden = false;
      });
    });
  };
}

export function mountPdfPreviews() {
  for (const [modal, state] of previews) {
    if (!state.canvas || modal.preview?.kind !== 'pdf') continue;
    const slot = document.querySelector(`[data-pdf-canvas="${CSS.escape(modal.previewInstance)}"]`);
    if (slot && slot.firstChild !== state.canvas) slot.replaceChildren(state.canvas);
  }
}

async function showPdfPage(modal, state, number, refresh, worker) {
  const { renderPdfPage } = await import('./pdf-preview.js');
  state.pdfPageController?.abort();
  const pageController = (state.pdfPageController = new AbortController());
  const signal = AbortSignal.any([state.controller.signal, pageController.signal]);
  const current = () => !signal.aborted && previews.has(modal) && S.ui.modals.includes(modal) && previewScopeCurrent(state);
  await renderPdfPage(state.pdf, number, signal, {
    worker,
    onPage({ canvas, page, pages }) {
      if (!current()) return false;
      if (state.canvas) state.canvas.width = state.canvas.height = 0;
      state.canvas = canvas;
      canvas.className = 'file-preview-image';
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', modal.file.name);
      canvas.setAttribute('translate', 'no');
      modal.preview = { kind: 'pdf', page, pages };
      refresh();
      return true;
    },
    onText(text) {
      if (!current()) return;
      modal.preview.text = text;
      const slot = document.querySelector(`[data-pdf-canvas="${CSS.escape(modal.previewInstance)}"]`);
      const paragraph = slot?.closest('.modal')?.querySelector('[data-pdf-page-text]');
      if (paragraph) paragraph.textContent = text;
    },
  });
}

export async function changePdfPreviewPage(modal, number, refresh) {
  const state = previews.get(modal);
  if (!state?.pdf || modal.preview?.kind !== 'pdf' || modal.preview.loading) return;
  modal.preview.loading = true;
  refresh();
  try {
    await showPdfPage(modal, state, number, refresh);
  } catch {
    if (!state.controller.signal.aborted) modal.preview = { kind: 'error', message: 'PDF preview is unavailable. Download the file instead.' };
    if (previews.has(modal) && S.ui.modals.includes(modal)) refresh();
  }
}
