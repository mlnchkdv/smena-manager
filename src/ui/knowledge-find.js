import { D, S } from '../core/store.js';
import { A } from '../actions/actions.js';
import { render } from '../shell/render.js';
import { esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { kc } from './knowledge-types.js';
import { parseKnowledgeQuery } from '../shared/knowledge-query.js';

let states = new WeakMap(),
  scan,
  frame,
  revealFrame,
  revealGeneration = 0,
  lastTarget = '';
const root = () => document.querySelector('.knowledge-drawer .knowledge-quick-content');
const surface = node => node?.querySelector('[data-knowledge-reader]') || node;
const current = find => find && find.owner === S.ui.currentUser?.id && find.workspace === (D().ws.id || D().ws.url);
function cancelScan() {
  cancelAnimationFrame(frame);
  cancelReveal();
  scan = null;
}
function cancelReveal() {
  cancelAnimationFrame(revealFrame);
  revealGeneration++;
}
function unmark(node) {
  if (!node) return;
  const parents = new Set();
  for (const mark of node.querySelectorAll('mark[data-knowledge-match]')) {
    parents.add(mark.parentNode);
    mark.replaceWith(document.createTextNode(mark.textContent));
  }
  for (const parent of parents) parent.normalize();
}
function updateBar(find, pending = false) {
  const bar = document.querySelector('.knowledge-find');
  if (!bar) return;
  const label = bar.querySelector('[data-knowledge-find-count]');
  if (label)
    label.textContent = pending
      ? kc('Searching…', 'Поиск…')
      : find.count
        ? `${find.index + 1} / ${find.count}${find.count === 300 ? '+' : ''}`
        : kc('Match in note details', 'Совпадение в сведениях');
  for (const button of bar.querySelectorAll('[data-a="stepKnowledgeMatch"]')) button.disabled = pending || !find.count;
}
function reveal(find) {
  const node = root();
  node?.querySelector('[data-knowledge-match][aria-current]')?.removeAttribute('aria-current');
  const target = node?.querySelector(`[data-knowledge-match="${find.index}"]`);
  if (!target) return;
  target.setAttribute('aria-current', 'true');
  const key = JSON.stringify([find.owner, find.workspace, find.noteId, find.query, find.index]);
  if (key === lastTarget) return;
  lastTarget = key;
  cancelReveal();
  const body = target.closest('.knowledge-drawer-body');
  if (!body) return;
  target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
  const generation = revealGeneration;
  let remaining = 8,
    stable = 0;
  // content-visibility can replace estimated heights over several frames. A
  // bounded correction keeps distant matches visible without laying out every
  // skipped block. User input cancels it.
  const settle = () => {
    if (generation !== revealGeneration || S.ui.knowledgeFind !== find || !current(find) || !target.isConnected || !body.isConnected) return;
    const box = body.getBoundingClientRect(),
      match = target.getBoundingClientRect();
    const visible = match.top >= box.top + 8 && match.bottom <= box.bottom - 8;
    if (visible) stable++;
    else {
      stable = 0;
      body.scrollTop += match.top - box.top - body.clientHeight / 2 + match.height / 2;
    }
    if (--remaining > 0 && stable < 2) revealFrame = requestAnimationFrame(settle);
  };
  settle();
}

for (const event of ['pointerdown', 'touchstart', 'wheel', 'keydown']) document.addEventListener(event, cancelReveal, { capture: true, passive: true });

// Shell markup contains only the toolbar. Mark live, sanitized text nodes after
// insertion instead of serializing/reparsing a multi-megabyte reader.
export function knowledgeFind(markup, noteId) {
  const find = S.ui.knowledgeFind;
  if (!current(find) || !parseKnowledgeQuery(find.query).terms.length) return { markup, bar: '' };
  if (find.noteId !== noteId) Object.assign(find, { noteId, index: 0, count: 0 });
  const bar = `<div class="knowledge-find" role="group" aria-label="${kc('Search matches', 'Совпадения поиска')}"><span class="trunc" translate="no">${esc(find.query)}</span><span class="num" role="status" data-knowledge-find-count></span><button class="ibtn ibtn-sm" data-a="stepKnowledgeMatch" data-direction="-1" aria-label="${kc('Previous match', 'Предыдущее совпадение')}" ${find.count ? '' : 'disabled'}>${ic('chevron-up', 15)}</button><button class="ibtn ibtn-sm" data-a="stepKnowledgeMatch" data-direction="1" aria-label="${kc('Next match', 'Следующее совпадение')}" ${find.count ? '' : 'disabled'}>${ic('chevron-down', 15)}</button><button class="ibtn ibtn-sm" data-a="clearKnowledgeFind" aria-label="${kc('Clear highlights', 'Убрать подсветку')}">${ic('x', 15)}</button></div>`;
  return { markup, bar };
}
A.stepKnowledgeMatch = el => {
  const find = S.ui.knowledgeFind;
  if (!current(find) || !find.count || scan) return;
  find.index = (find.index + Number(el.dataset.direction) + find.count) % find.count;
  updateBar(find);
  reveal(find);
};
A.clearKnowledgeFind = () => {
  cancelScan();
  const node = root();
  states.delete(surface(node));
  unmark(node);
  S.ui.knowledgeFind = null;
  lastTarget = '';
  render();
};
export function refreshKnowledgeFind() {
  const find = S.ui.knowledgeFind,
    node = root();
  if (!node) {
    cancelScan();
    lastTarget = '';
    return;
  }
  if (!current(find)) {
    cancelScan();
    unmark(node);
    states.delete(surface(node));
    lastTarget = '';
    return;
  }
  if (node.querySelector('[data-knowledge-preparing]')) {
    updateBar(find, true);
    return;
  }
  const target = surface(node),
    key = JSON.stringify([find.owner, find.workspace, find.noteId, find.query]);
  const cached = states.get(target);
  if (cached?.key === key) {
    Object.assign(find, { count: cached.count, index: Math.min(find.index || 0, Math.max(0, cached.count - 1)) });
    updateBar(find);
    reveal(find);
    return;
  }
  if (scan?.target === target && scan.key === key && scan.find === find) {
    updateBar(find, true);
    return;
  }
  cancelScan();
  unmark(node);
  states.delete(target);
  lastTarget = '';
  const terms = parseKnowledgeQuery(find.query).terms.filter(Boolean).slice(0, 16);
  if (!terms.length) return;
  const pattern = new RegExp(
    terms
      .sort((a, b) => b.length - a.length)
      .map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|'),
    'giu',
  );
  const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
  const work = { target, key, find, walker, next: walker.nextNode(), count: 0 };
  scan = work;
  Object.assign(find, { index: 0, count: 0 });
  updateBar(find, true);
  const advance = () => {
    if (scan !== work) return;
    if (!target.isConnected || S.ui.knowledgeFind !== find || !current(find)) return cancelScan();
    const until = performance.now() + 8;
    let visited = 0;
    while (work.next && work.count < 300 && visited++ < 200 && performance.now() < until) {
      const textNode = work.next;
      work.next = walker.nextNode(); // Advance before replacing the current node.
      if (textNode.parentElement?.closest('button,mark,[aria-hidden="true"],template')) continue;
      pattern.lastIndex = 0;
      const text = textNode.textContent,
        fragment = document.createDocumentFragment();
      let offset = 0;
      for (const match of text.matchAll(pattern)) {
        if (work.count >= 300) break;
        fragment.append(text.slice(offset, match.index));
        const mark = document.createElement('mark');
        mark.dataset.knowledgeMatch = String(work.count++);
        mark.tabIndex = -1;
        mark.textContent = match[0];
        fragment.append(mark);
        offset = match.index + match[0].length;
      }
      if (offset) {
        fragment.append(text.slice(offset));
        textNode.replaceWith(fragment);
      }
    }
    if (work.next && work.count < 300) frame = requestAnimationFrame(advance);
    else {
      find.count = work.count;
      states.set(target, { key, count: work.count });
      scan = null;
      updateBar(find);
      reveal(find);
    }
  };
  frame = requestAnimationFrame(advance);
}
for (const event of ['smena:upload-scope-change', 'smena:session-account-changed'])
  window.addEventListener(event, () => {
    cancelScan();
    states = new WeakMap();
    lastTarget = '';
  });
