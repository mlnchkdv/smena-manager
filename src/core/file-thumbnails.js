import { D, S } from './store.js';
import { downloadWorkspaceFile } from './api.js';
import { canLoadThumbnail } from '../shared/file-preview-policy.js';

const cache = new Map();
let owner;
let generation = 0;
let observer;
let active = 0;
let queue = [];
const keyFor = file => JSON.stringify([owner, file.id, file.storageFileId || file.storageName]);
const visible = new Set();

function mount(key, url) {
  for (const element of document.querySelectorAll('[data-file-thumb]')) {
    const file = D().files.find(item => item.id === element.dataset.fileThumb);
    if (!file || keyFor(file) !== key || element.querySelector('.file-thumbnail')) continue;
    const image = document.createElement('img');
    image.className = 'file-thumbnail';
    image.alt = '';
    image.decoding = 'async';
    image.src = url;
    element.prepend(image);
  }
}

function pump() {
  while (active < 2 && queue.length) {
    const [key, file, state] = queue.shift();
    if (!cache.has(key) || state.generation !== generation) continue;
    active += 1;
    void downloadWorkspaceFile(file.id, false, { signal: state.controller.signal, maxBytes: 256 * 1024 })
      .then(({ blob }) => {
        if (state.generation !== generation || state.controller.signal.aborted) return;
        state.url = URL.createObjectURL(blob);
        mount(key, state.url);
      })
      .catch(() => {
        state.failed = true;
      })
      .finally(() => {
        state.busy = false;
        if (state.generation === generation) {
          active -= 1;
          pump();
        }
      });
  }
}

export function syncFileThumbnails() {
  observer?.disconnect();
  visible.clear();
  const currentOwner = S.ui.auth ? null : S.ui.currentUser?.id;
  if (owner !== currentOwner) {
    generation += 1;
    for (const state of cache.values()) {
      state.controller.abort();
      if (state.url) URL.revokeObjectURL(state.url);
    }
    cache.clear();
    queue = [];
    active = 0;
    owner = currentOwner;
  }
  if (!owner || typeof IntersectionObserver === 'undefined') return;
  observer = new IntersectionObserver(
    entries => {
      const files = new Map(D().files.map(file => [file.id, file]));
      for (const entry of entries) {
        const file = files.get(entry.target.dataset.fileThumb);
        if (!file || !canLoadThumbnail(file)) continue;
        const key = keyFor(file);
        if (entry.isIntersecting) visible.add(key);
        else visible.delete(key);
      }
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const file = files.get(entry.target.dataset.fileThumb);
        if (!file || !canLoadThumbnail(file)) continue;
        const key = keyFor(file);
        if (cache.get(key)?.url) {
          mount(key, cache.get(key).url);
          continue;
        }
        if (cache.has(key)) continue;
        if (cache.size >= 32) {
          const unused = [...cache].find(([candidate, state]) => !visible.has(candidate) && !state.busy);
          if (!unused) continue;
          if (unused[1].url) URL.revokeObjectURL(unused[1].url);
          cache.delete(unused[0]);
        }
        const state = { controller: new AbortController(), generation, busy: true };
        cache.set(key, state);
        queue.push([key, file, state]);
      }
      pump();
    },
    { rootMargin: '100px' },
  );
  document.querySelectorAll('[data-file-thumb]').forEach(element => observer.observe(element));
}
