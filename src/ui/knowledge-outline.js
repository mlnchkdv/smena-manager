import { esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { kc } from './knowledge-types.js';
import { disclosureAttributes } from './disclosure.js';

export function knowledgeOutline(markup, actions = '', noteId = '') {
  const template = document.createElement('template');
  // Markup is emitted by our allowlisted renderer. Parse only its headings,
  // rather than building a second, document-sized DOM just for the outline.
  const headings = [];
  for (const match of markup.matchAll(/<h([1-6])\b[^>]*data-knowledge-heading="[^"]*"[^>]*>[\s\S]*?<\/h\1>/g)) {
    template.innerHTML = match[0];
    const heading = template.content.firstElementChild;
    if (heading) headings.push(heading);
  }
  if (headings.length < 4 && !actions) return '';
  const hasOutline = headings.length >= 4;
  const base = headings.reduce((level, heading) => Math.min(level, Number(heading.tagName.slice(1))), 6);
  const utilities = actions
    ? `<details class="ui-menu knowledge-outline knowledge-reader-actions" ${disclosureAttributes('knowledge-reader-actions:' + noteId)}><summary class="ibtn" aria-label="${kc('Note actions', 'Действия с заметкой')}" title="${kc('Note actions', 'Действия с заметкой')}">${ic('ellipsis', 16)}</summary><div>${actions}</div></details>`
    : '';
  if (!hasOutline) return utilities;
  return `<details class="ui-menu knowledge-outline knowledge-reader-outline" ${disclosureAttributes('knowledge-reader-outline:' + noteId)}><summary class="ibtn" aria-label="${kc('On this page', 'На этой странице')}" title="${kc('On this page', 'На этой странице')}">${ic(hasOutline ? 'list-tree' : 'ellipsis', 16)}</summary><div>${
    hasOutline
      ? `<nav aria-label="On this page"><p class="knowledge-outline-label">On this page</p>${headings
          .map(
            heading =>
              `<button class="knowledge-outline-link" data-a="knowledgeAnchor" data-anchor="${esc(heading.dataset.knowledgeHeading)}" style="--outline-depth:${Number(heading.tagName.slice(1)) - base}"><span translate="no">${esc(heading.textContent)}</span></button>`,
          )
          .join('')}</nav>`
      : ''
  }</div></details>${utilities}`;
}

export function refreshKnowledgeOutline() {
  const outline = document.querySelector('.knowledge-reader-outline');
  const body = outline?.closest('.knowledge-drawer')?.querySelector('.knowledge-drawer-body');
  if (!body) return;
  const headings = [...body.querySelectorAll('[data-knowledge-heading]')];
  const top = body.getBoundingClientRect().top + 24;
  const atEnd = body.scrollHeight > body.clientHeight + 2 && body.scrollTop + body.clientHeight >= body.scrollHeight - 2;
  const current = (atEnd ? headings.at(-1) : headings.findLast(heading => heading.getBoundingClientRect().top <= top)) || headings[0];
  outline.querySelectorAll('.knowledge-outline-link').forEach(link => {
    if (current?.dataset.knowledgeHeading && link.dataset.anchor === current.dataset.knowledgeHeading) link.setAttribute('aria-current', 'location');
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
