import { A } from '../actions/actions.js';
import { currentWhiteboard, whiteboardMaterial, whiteboardScope, whiteboardState, wbText as T } from './whiteboard-state.js';
import { downloadWorkspaceFile } from './api.js';
import { filePreviewPolicy } from '../shared/file-preview-policy.js';
import { whiteboardOf } from '../shared/project-whiteboard.js';
import { render } from '../shell/render.js';

const cache = new Map();
let scope = '',
  generation = 0,
  observer,
  running = 0,
  queue = [];
const live = new Set();
const elements = () => [...document.querySelectorAll('[data-whiteboard-media]')];
const nodeFor = id => whiteboardOf(currentWhiteboard()).nodes.find(node => node.id === id);
const pageFor = node => whiteboardState().mediaPages?.[node.id] || node.media?.page || 1;
const fileKey = file => JSON.stringify([file.id, file.storageFileId || file.storageName, file.bytes, file.mimeType]);
function release(key) {
  const entry = cache.get(key);
  if (!entry) return;
  entry.controller.abort();
  for (const page of entry.pages.values()) if (page.url) URL.revokeObjectURL(page.url);
  cache.delete(key);
}
function reset() {
  generation++;
  for (const key of cache.keys()) release(key);
  queue = [];
  running = 0;
}
function paint(element, entry, page) {
  const state = entry.pages.get(page);
  if (!state || !element.isConnected) return;
  if (state.pending) return;
  element.replaceChildren();
  if (state.url) {
    const image = document.createElement('img');
    image.className = 'whiteboard-inline-image';
    image.decoding = 'async';
    image.alt = entry.kind === 'pdf' ? entry.file.name + ' · ' + T('Page', 'Страница') + ' ' + state.page : entry.file.name;
    image.onerror = () => {
      if (cache.get(entry.key) !== entry || entry.pages.get(page) !== state) return;
      URL.revokeObjectURL(state.url);
      entry.pages.set(page, { failed: true });
      paintEntry(entry, page);
    };
    image.src = state.url;
    element.append(image);
  } else {
    const hint = document.createElement('span');
    hint.className = 'hint';
    hint.textContent = T('Preview unavailable. Open the file or retry.', 'Предпросмотр недоступен. Откройте файл или повторите.');
    element.append(hint);
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'btn btn-ghost btn-sm';
    retry.dataset.a = 'whiteboardRetryMedia';
    retry.dataset.id = element.dataset.whiteboardMedia;
    retry.textContent = T('Retry', 'Повторить');
    element.append(retry);
  }
  const controls = element.parentElement.querySelector('.whiteboard-media-pages');
  if (controls && state.pages) {
    controls.querySelector('[data-whiteboard-page-label]').textContent = state.page + ' / ' + state.pages;
    for (const button of controls.querySelectorAll('button')) button.disabled = Number(button.dataset.step) < 0 ? state.page <= 1 : state.page >= state.pages;
  }
}
function paintEntry(entry, page) {
  for (const element of elements()) if (element.dataset.previewKey === entry.key && Number(element.dataset.mediaPage) === page) paint(element, entry, page);
}
async function load(entry, page, owner) {
  try {
    entry.source ||= downloadWorkspaceFile(entry.file.id, false, { signal: entry.controller.signal, maxBytes: 20 * 1024 ** 2 }).then(result => result.blob);
    const blob = await entry.source;
    if (owner !== generation || entry.controller.signal.aborted) return;
    let result;
    if (entry.kind === 'pdf') {
      const { renderPdfPage } = await import('./pdf-preview.js');
      result = await renderPdfPage(blob, page, entry.controller.signal);
    } else result = { blob, page: 1, pages: 1 };
    if (owner !== generation || entry.controller.signal.aborted) return;
    const url = URL.createObjectURL(result.blob);
    entry.pages.set(page, { url, page: result.page, pages: result.pages });
    // Keep at most three rendered pages per PDF. Source bytes remain bounded
    // separately and are reused when browsing back without a second download.
    for (const [number, state] of entry.pages)
      if (entry.pages.size > 3 && number !== page && !state.pending) {
        if (state.url) URL.revokeObjectURL(state.url);
        entry.pages.delete(number);
      }
  } catch {
    if (owner !== generation || entry.controller.signal.aborted) return;
    entry.source = null;
    entry.pages.set(page, { failed: true });
  } finally {
    if (owner === generation) {
      paintEntry(entry, page);
      running--;
      pump();
    }
  }
}
function pump() {
  while (running < 2 && queue.length) {
    const { entry, page, owner } = queue.shift();
    if (owner !== generation || entry.controller.signal.aborted) continue;
    running++;
    void load(entry, page, owner);
  }
}
function request(element) {
  const node = nodeFor(element.dataset.whiteboardMedia),
    source = node && whiteboardMaterial(node);
  if (source?.kind !== 'file') return;
  const kind = filePreviewPolicy(source.item).kind;
  if (!['image', 'pdf'].includes(kind)) return;
  const key = fileKey(source.item),
    page = kind === 'pdf' ? pageFor(node) : 1;
  let entry = cache.get(key);
  if (!entry) {
    let total = () => [...cache.values()].reduce((sum, item) => sum + item.file.bytes, 0);
    while (cache.size >= 6 || total() + source.item.bytes > 32 * 1024 ** 2) {
      const unused = [...cache.keys()].find(k => !live.has(k));
      if (!unused) break;
      release(unused);
    }
    if (cache.size >= 6 || total() + source.item.bytes > 32 * 1024 ** 2) {
      element.textContent = T('Open preview to view this file.', 'Откройте предпросмотр, чтобы прочитать файл.');
      return;
    }
    entry = { key, file: source.item, kind, pages: new Map(), controller: new AbortController() };
    cache.set(key, entry);
  }
  element.dataset.previewKey = key;
  if (entry.pages.has(page)) return paint(element, entry, page);
  entry.pages.set(page, { pending: true });
  queue.push({ entry, page, owner: generation });
  pump();
}
export function syncWhiteboardPreviews() {
  observer?.disconnect();
  live.clear();
  const board = currentWhiteboard(),
    owner = board ? whiteboardScope(board.id) : '';
  if (scope !== owner) {
    reset();
    scope = owner;
  }
  if (!owner || typeof IntersectionObserver === 'undefined') return;
  for (const [key, entry] of cache)
    if (
      !whiteboardOf(board).nodes.some(node => {
        const source = node.type === 'material' && whiteboardMaterial(node);
        return source?.kind === 'file' && fileKey(source.item) === entry.key;
      })
    )
      release(key);
  observer = new IntersectionObserver(
    entries => {
      for (const item of entries) {
        const node = nodeFor(item.target.dataset.whiteboardMedia),
          file = node && whiteboardMaterial(node)?.item;
        if (file) {
          const key = fileKey(file);
          if (item.isIntersecting) live.add(key);
          else live.delete(key);
        }
      }
      for (const item of entries) if (item.isIntersecting) request(item.target);
    },
    { root: document.querySelector('.whiteboard-viewport'), rootMargin: '80px' },
  );
  for (const element of elements()) observer.observe(element);
}
A.whiteboardMediaPage = el => {
  const node = nodeFor(el.dataset.id),
    source = node && whiteboardMaterial(node);
  if (source?.kind !== 'file' || filePreviewPolicy(source.item).kind !== 'pdf') return;
  const state = cache.get(fileKey(source.item))?.pages.get(pageFor(node));
  if (!state?.pages) return;
  const page = Math.max(1, Math.min(state.pages, state.page + (Number(el.dataset.step) < 0 ? -1 : 1)));
  const view = whiteboardState();
  view.mediaPages ||= {};
  view.mediaPages[node.id] = page;
  render();
};
A.whiteboardRetryMedia = el => {
  const node = nodeFor(el.dataset.id),
    source = node && whiteboardMaterial(node);
  if (source?.kind !== 'file') return;
  const entry = cache.get(fileKey(source.item));
  if (entry?.pages.get(pageFor(node))?.failed) entry.pages.delete(pageFor(node));
  render();
};
