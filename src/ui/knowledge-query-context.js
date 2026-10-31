import { A } from '../actions/actions.js';
import { D, S } from '../core/store.js';
import { esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { render } from '../shell/render.js';
import { kc, typeName } from './knowledge-types.js';
import { noteTypes } from '../shared/knowledge-types.js';
import { knowledgeQueryTokens, removeKnowledgeQueryToken } from '../shared/knowledge-query-context.js';
import { knowledgeDisclosure } from './knowledge-disclosure.js';
export function knowledgeQueryContext(folder, label) {
  const tokens = knowledgeQueryTokens(S.ui.knowledgeQuery),
    candidate = S.ui.knowledgeActiveCollection,
    collection = candidate?.owner === S.ui.currentUser?.id && candidate?.workspace === (D().ws.id || D().ws.url) ? candidate : null;
  if (!tokens.length && !S.ui.knowledgeTag && !collection) return '';
  const name = token => {
    const r = token.rule;
    if (!r) return token.raw;
    if (r.field === 'type') return `${kc('Type', 'Тип')}: ${typeName(noteTypes(D().ws).find(t => t.id === r.value) || { name: r.value })}`;
    if (r.field === 'tag') return `${kc('Tag', 'Тег')}: ${r.value}`;
    const id = r.field.replace('field:', ''),
      field = noteTypes(D().ws)
        .flatMap(t => t.fields)
        .find(f => f.id === (r.field === 'has' ? r.value : id));
    if (r.field === 'has') return `${kc('Has property', 'Есть свойство')}: ${field ? typeName(field) : r.value}`;
    return `${field ? typeName(field) : r.field} ${r.op} ${r.value}`;
  };
  return `<section class="knowledge-query-context" aria-label="${kc('Search scope', 'Область поиска')}" translate="no"><div class="knowledge-query-scope"><span>${kc('Search scope', 'Область поиска')}:</span><strong>${esc(label)}</strong>${folder !== 'all' ? `<button class="ibtn" data-a="clearKnowledgeScope" aria-label="${kc('Search all folders', 'Искать во всех папках')}" title="${kc('Search all folders', 'Искать во всех папках')}">${ic('x', 13)}</button>` : ''}</div>${collection ? `<p class="hint">${kc('Collection', 'Подборка')}: ${esc(collection.name)}${collection.query !== S.ui.knowledgeQuery ? ` · ${kc('Modified query', 'Запрос изменён')}` : ''}<button class="ibtn" data-a="clearKnowledgeCollection" aria-label="${kc('Clear collection context', 'Убрать контекст подборки')}">${ic('x', 12)}</button></p>` : ''}${
    tokens.length
      ? `<details ${knowledgeDisclosure('catalog', 'query-conditions')}><summary>${kc('Conditions', 'Условия')} · ${Math.min(16, tokens.length)} · ${kc('all must match', 'должны совпасть все')}</summary><div class="knowledge-query-chips">${tokens
          .slice(0, 16)
          .map(
            token =>
              `<button data-a="removeKnowledgeQueryToken" data-index="${token.index}" title="${esc(token.raw)}" aria-label="${esc(kc('Remove condition', 'Убрать условие') + ': ' + name(token))}"><span>${esc(name(token))}</span>${ic('x', 12)}</button>`,
          )
          .join(
            '',
          )}</div>${tokens.length > 16 ? `<p class="hint">${kc('Only the first 16 conditions are applied.', 'Применяются только первые 16 условий.')}</p>` : ''}</details>`
      : ''
  }</section>`;
}
A.removeKnowledgeQueryToken = el => {
  S.ui.knowledgeQuery = removeKnowledgeQueryToken(S.ui.knowledgeQuery, Number(el.dataset.index));
  S.ui.knowledgeOffset = 0;
  render();
};
A.clearKnowledgeScope = () => {
  S.ui.knowledgeFolder = 'all';
  S.ui.knowledgeOffset = 0;
  render();
};
A.clearKnowledgeCollection = () => {
  S.ui.knowledgeActiveCollection = null;
  render();
};
