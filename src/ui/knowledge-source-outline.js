import { knowledgeSourceHeadings } from '../shared/knowledge-source-headings.js';
import { D } from '../core/store.js';
import { A } from '../actions/actions.js';
import { esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { kc } from './knowledge-types.js';
import { captureKnowledgeEditorPosition } from './knowledge-editor-position.js';

export function sourceOutline(note) {
  const headings = knowledgeSourceHeadings(note);
  if (!headings.length) return '';
  return `<details class="ui-menu knowledge-outline knowledge-source-outline"><summary class="ibtn" aria-label="${kc('Source sections', 'Разделы исходника')}" title="${kc('Source sections', 'Разделы исходника')}">${ic('list-tree', 16)}</summary><div><nav aria-label="${kc('Source sections', 'Разделы исходника')}">${headings.map(h => `<button class="knowledge-outline-link" aria-label="${esc(kc('Go to source section', 'К разделу исходника') + ': ' + h.title)}" data-a="knowledgeSourceHeading" data-id="${esc(note.id)}" data-title="${esc(h.title)}" data-level="${h.level}" data-ordinal="${h.ordinal}" style="--outline-depth:${h.level - 1}" translate="no">${esc(h.title)}</button>`).join('')}</nav></div></details>`;
}

A.knowledgeSourceHeading = el => {
  const input = document.querySelector('#knowledge-body');
  const note = D().knowledgeNotes.find(n => n.id === el.dataset.id);
  if (!note || input?.dataset.id !== note.id) return;
  // The menu may predate a keystroke. Resolve against the live source again.
  const heading = knowledgeSourceHeadings({ ...note, formatted_markdown: input.value }).find(
    h => h.title === el.dataset.title && h.level === Number(el.dataset.level) && h.ordinal === Number(el.dataset.ordinal),
  );
  if (!heading) return;
  document.querySelector('.knowledge-source-outline')?.removeAttribute('open');
  const mirror = document.createElement('div');
  const style = getComputedStyle(input);
  Object.assign(mirror.style, {
    position: 'fixed',
    visibility: 'hidden',
    left: '-100000px',
    top: '0',
    width: `${input.clientWidth}px`,
    whiteSpace: input.wrap === 'off' ? 'pre' : 'pre-wrap',
  });
  for (const key of [
    'fontFamily',
    'fontSize',
    'fontWeight',
    'fontStyle',
    'lineHeight',
    'letterSpacing',
    'textIndent',
    'tabSize',
    'padding',
    'boxSizing',
    'wordBreak',
    'overflowWrap',
  ])
    mirror.style[key] = style[key];
  mirror.textContent = input.value.slice(0, heading.start);
  const marker = document.createElement('span');
  marker.textContent = '\u200b';
  mirror.append(marker);
  document.body.append(mirror);
  const top = marker.offsetTop;
  mirror.remove();
  input.focus({ preventScroll: true });
  input.setSelectionRange(heading.start, heading.start);
  input.scrollTop = Math.max(0, top - input.clientHeight / 4);
  input.scrollLeft = 0;
  input.scrollIntoView({ block: 'nearest' });
  captureKnowledgeEditorPosition();
};
