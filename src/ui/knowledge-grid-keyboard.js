import { D, S } from '../core/store.js';

const selector = '.knowledge-preview-open, .knowledge-folder-card';
let scope, last;
function rows() {
  return [...document.querySelectorAll(`.knowledge-main ${selector.split(', ').join(', .knowledge-main ')}`)].filter(
    el => el.getClientRects().length && !el.closest('details:not([open])'),
  );
}
const key = el => `${el.dataset.a}:${el.dataset.id || el.dataset.folder}`;
export function refreshKnowledgeGridKeyboard() {
  const nextScope = JSON.stringify([S.ui.currentUser?.id, D().ws.id || D().ws.url]);
  if (scope !== nextScope) {
    scope = nextScope;
    last = null;
  }
  const items = rows();
  const chosen = items.find(el => key(el) === last) || items[0];
  items.forEach(el => {
    el.tabIndex = el === chosen ? 0 : -1;
  });
}
document.addEventListener(
  'toggle',
  event => {
    if (event.target.matches?.('.knowledge-main details')) refreshKnowledgeGridKeyboard();
  },
  true,
);

document.addEventListener('focusin', event => {
  if (event.target.matches?.(selector) && event.target.closest('.knowledge-main')) last = key(event.target);
});
document.addEventListener('keydown', event => {
  const current = event.target;
  if (!current.matches?.(selector) || !current.closest('.knowledge-main') || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const items = rows();
  let target;
  if (event.key === 'Home') target = items[0];
  else if (event.key === 'End') target = items.at(-1);
  else {
    const rect = current.getBoundingClientRect();
    const x = rect.left + rect.width / 2,
      y = rect.top + rect.height / 2;
    const horizontal = ['ArrowLeft', 'ArrowRight'].includes(event.key);
    const direction = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1;
    target = items
      .map(el => {
        const r = el.getBoundingClientRect();
        const dx = r.left + r.width / 2 - x,
          dy = r.top + r.height / 2 - y;
        return { el, primary: (horizontal ? dx : dy) * direction, cross: Math.abs(horizontal ? dy : dx) };
      })
      .filter(item => item.primary > 2)
      .sort((a, b) => a.primary + a.cross * 3 - (b.primary + b.cross * 3))[0]?.el;
  }
  event.preventDefault();
  if (!target) return;
  items.forEach(el => {
    el.tabIndex = el === target ? 0 : -1;
  });
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
});
