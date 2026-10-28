import { esc } from '../core/utils.js';
import { ic } from '../core/icons.js';

export function knowledgeOutline(markup, actions = '') {
  const template = document.createElement('template');
  template.innerHTML = markup;
  const headings = [...template.content.querySelectorAll('[data-knowledge-heading]')];
  if (headings.length < 4) return '';
  const base = Math.min(...headings.map(heading => Number(heading.tagName.slice(1))));
  return `<details class="ui-menu knowledge-outline"><summary class="ibtn" aria-label="Contents and actions" title="Contents and actions">${ic('list-tree', 16)}</summary><div>${actions}<nav aria-label="On this page"><p class="knowledge-outline-label">On this page</p>${headings
    .map(
      heading =>
        `<button class="knowledge-outline-link" data-a="knowledgeAnchor" data-anchor="${esc(heading.dataset.knowledgeHeading)}" style="--outline-depth:${Number(heading.tagName.slice(1)) - base}"><span translate="no">${esc(heading.textContent)}</span></button>`,
    )
    .join('')}</nav></div></details>`;
}

export function refreshKnowledgeOutline() {
  const outline = document.querySelector('.knowledge-outline');
  const body = outline?.closest('.knowledge-drawer')?.querySelector('.knowledge-drawer-body');
  if (!body) return;
  const headings = [...body.querySelectorAll('[data-knowledge-heading]')];
  const top = body.getBoundingClientRect().top + 24;
  const atEnd = body.scrollTop + body.clientHeight >= body.scrollHeight - 2;
  const current = (atEnd ? headings.at(-1) : headings.findLast(heading => heading.getBoundingClientRect().top <= top)) || headings[0];
  outline.querySelectorAll('.knowledge-outline-link').forEach(link => {
    if (link.dataset.anchor === current?.dataset.knowledgeHeading) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  });
}

let frame;
document.addEventListener(
  'scroll',
  event => {
    if (!event.target.matches?.('.knowledge-drawer-body')) return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(refreshKnowledgeOutline);
  },
  { capture: true, passive: true },
);
