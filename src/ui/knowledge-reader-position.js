import { D, S } from '../core/store.js';
import { readLayoutPreference, writeLayoutPreference } from '../core/view-layout-preferences.js';

const scope = () => JSON.stringify([S.ui.currentUser?.id, D().ws.id || D().ws.url]);
let mounted;
let timer;
const positions = () => {
  const saved = readLayoutPreference('knowledge-reading-positions', []);
  const ids = new Set(D().knowledgeNotes.map(note => note.id));
  return (Array.isArray(saved) ? saved : [])
    .filter(entry => Array.isArray(entry) && ids.has(entry[0]) && Number.isFinite(entry[1]?.ratio) && entry[1].ratio >= 0 && entry[1].ratio <= 1)
    .slice(-50);
};

// Called before a render too: closing a reader must flush its last position.
// Never save an old DOM into a newly selected account/workspace namespace.
export function captureReaderPosition() {
  if (!mounted || mounted.pending || mounted.scope !== scope() || !mounted.body.isConnected || !mounted.body.querySelector('.knowledge-quick-preview')) return;
  const { body, id } = mounted;
  if (!D().knowledgeNotes.some(note => note.id === id)) return;
  const top = body.getBoundingClientRect().top + 8;
  const heading = [...body.querySelectorAll('[data-knowledge-heading]')].findLast(el => el.getBoundingClientRect().top <= top);
  const value = {
    ratio: Math.max(0, Math.min(1, body.scrollTop / Math.max(1, body.scrollHeight - body.clientHeight))),
    anchor: heading?.dataset.knowledgeHeading || '',
    offset: heading ? Math.max(0, top - heading.getBoundingClientRect().top) : 0,
  };
  writeLayoutPreference('knowledge-reading-positions', [...positions().filter(([key]) => key !== id), [id, value]].slice(-50));
}

export function restoreReaderPosition() {
  const body = document.querySelector('.knowledge-drawer-body[data-reading-note]:has(.knowledge-quick-preview)');
  if (!body) {
    mounted = null;
    return;
  }
  const id = body.dataset.readingNote;
  const changed = mounted?.id !== id || mounted?.scope !== scope() || mounted.pending;
  mounted = { body, id, scope: scope() };
  if (!changed || S.ui.knowledgeFind) return;
  const saved = positions().find(([key]) => key === id)?.[1];
  if (!saved?.ratio) return;
  const owner = mounted.scope;
  mounted.pending = true;
  requestAnimationFrame(() => {
    if (!body.isConnected || mounted?.body !== body || !mounted.pending || owner !== scope()) return;
    mounted.pending = false;
    if (S.ui.knowledgeFind) return;
    const headings = [...body.querySelectorAll('[data-knowledge-heading]')];
    const heading = headings.find(el => el.dataset.knowledgeHeading === saved.anchor);
    const next = heading && headings[headings.indexOf(heading) + 1];
    const base = heading ? body.scrollTop + heading.getBoundingClientRect().top - body.getBoundingClientRect().top - 8 : 0;
    const offset = Math.max(0, Math.min(50000, Number(saved.offset) || 0, next ? next.offsetTop - heading.offsetTop - 8 : Infinity));
    body.scrollTop = heading ? base + offset : saved.ratio * (body.scrollHeight - body.clientHeight);
  });
}

export function readerToStart() {
  const body = mounted?.scope === scope() && mounted.body;
  if (!body?.isConnected) return;
  mounted.pending = false;
  document.querySelector('.knowledge-reader-actions')?.removeAttribute('open');
  body.scrollTop = 0;
  captureReaderPosition();
  const title = body.querySelector('.knowledge-reader-title');
  if (title) {
    title.tabIndex = -1;
    title.focus({ preventScroll: true });
  }
}

document.addEventListener(
  'scroll',
  event => {
    if (event.target !== mounted?.body) return;
    clearTimeout(timer);
    timer = setTimeout(captureReaderPosition, 250);
  },
  { capture: true, passive: true },
);
