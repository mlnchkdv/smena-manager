import { getSessionGeneration } from './api.js';
import { render } from '../shell/render.js';
let state = null,
  worker = null,
  timer;
export function clearMarkdownPreparation() {
  worker?.terminate();
  worker = null;
  clearTimeout(timer);
  state = null;
}
export function preparedMarkdown(source) {
  const owner = getSessionGeneration();
  if (state?.owner !== owner) clearMarkdownPreparation();
  if (state?.source === source) return state;
  clearMarkdownPreparation();
  const current = { source, owner, pending: true, id: crypto.randomUUID() };
  state = current;
  const complete = () => {
    if (state !== current || owner !== getSessionGeneration()) return;
    worker?.terminate();
    worker = null;
    clearTimeout(timer);
    current.pending = false;
    render();
  };
  try {
    worker = new Worker(new URL('./knowledge-markdown-parser.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      if (state !== current || data.id !== current.id) return;
      current.tokens = data.tokens;
      current.error = !!data.error;
      complete();
    };
    worker.onerror = event => {
      event.preventDefault();
      current.error = true;
      complete();
    };
    timer = setTimeout(() => {
      current.error = true;
      complete();
    }, 10000);
    worker.postMessage({ id: current.id, source });
  } catch {
    current.error = true;
    queueMicrotask(complete);
  }
  return current;
}
window.addEventListener('smena:upload-scope-change', clearMarkdownPreparation);
window.addEventListener('smena:session-account-changed', clearMarkdownPreparation);
