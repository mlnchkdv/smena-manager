import { D, S } from '../core/store.js';
import { A } from '../actions/actions.js';
import { render } from '../shell/render.js';
import { esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { kc } from './knowledge-types.js';
import { parseKnowledgeQuery } from '../shared/knowledge-query.js';

// Work only on the already sanitized reader markup, never on the saved source.
export function knowledgeFind(markup, noteId) {
  const find = S.ui.knowledgeFind;
  if (!find || find.owner !== S.ui.currentUser?.id || find.workspace !== (D().ws.id || D().ws.url)) return { markup, bar: '' };
  const terms = parseKnowledgeQuery(find.query).terms.filter(Boolean).slice(0, 16);
  if (!terms.length) return { markup, bar: '' };
  const template = document.createElement('template');
  template.innerHTML = markup;
  const pattern = new RegExp(
    terms
      .sort((a, b) => b.length - a.length)
      .map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|'),
    'giu',
  );
  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) if (!walker.currentNode.parentElement?.closest('button,mark,[aria-hidden="true"]')) nodes.push(walker.currentNode);
  let count = 0;
  for (const node of nodes) {
    if (count >= 300) break;
    const text = node.textContent;
    pattern.lastIndex = 0;
    const fragment = document.createDocumentFragment();
    let offset = 0;
    for (const match of text.matchAll(pattern)) {
      if (count >= 300) break;
      fragment.append(text.slice(offset, match.index));
      const mark = document.createElement('mark');
      mark.dataset.knowledgeMatch = String(count++);
      mark.tabIndex = -1;
      mark.textContent = match[0];
      fragment.append(mark);
      offset = match.index + match[0].length;
    }
    if (offset) {
      fragment.append(text.slice(offset));
      node.replaceWith(fragment);
    }
  }
  const index = find.noteId === noteId ? Math.min(find.index || 0, Math.max(0, count - 1)) : 0;
  Object.assign(find, { noteId, index, count });
  const bar = `<div class="knowledge-find" role="group" aria-label="${kc('Search matches', 'Совпадения поиска')}"><span class="trunc" translate="no">${esc(find.query)}</span><span class="num" role="status">${count ? `${index + 1} / ${count}${count === 300 ? '+' : ''}` : kc('Match in note details', 'Совпадение в сведениях')}</span><button class="ibtn ibtn-sm" data-a="stepKnowledgeMatch" data-direction="-1" aria-label="${kc('Previous match', 'Предыдущее совпадение')}" ${count ? '' : 'disabled'}>${ic('chevron-up', 15)}</button><button class="ibtn ibtn-sm" data-a="stepKnowledgeMatch" data-direction="1" aria-label="${kc('Next match', 'Следующее совпадение')}" ${count ? '' : 'disabled'}>${ic('chevron-down', 15)}</button><button class="ibtn ibtn-sm" data-a="clearKnowledgeFind" aria-label="${kc('Clear highlights', 'Убрать подсветку')}">${ic('x', 15)}</button></div>`;
  return { markup: template.innerHTML, bar };
}
A.stepKnowledgeMatch = el => {
  const find = S.ui.knowledgeFind;
  if (!find?.count) return;
  find.index = (find.index + Number(el.dataset.direction) + find.count) % find.count;
  render();
};
A.clearKnowledgeFind = () => {
  S.ui.knowledgeFind = null;
  render();
};
let lastTarget = '';
export function refreshKnowledgeFind() {
  const find = S.ui.knowledgeFind;
  const target = document.querySelector(`.knowledge-quick-content [data-knowledge-match="${find?.index}"]`);
  if (!target) {
    lastTarget = '';
    return;
  }
  target.setAttribute('aria-current', 'true');
  const key = JSON.stringify([find.owner, find.workspace, find.noteId, find.query, find.index]);
  if (key === lastTarget) return;
  lastTarget = key;
  requestAnimationFrame(() => {
    if (target.isConnected) target.scrollIntoView({ block: 'center' });
  });
}
