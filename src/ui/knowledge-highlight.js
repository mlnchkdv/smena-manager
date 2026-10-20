import { esc } from '../core/utils.js';
import { searchTerms } from '../shared/knowledge-search.js';
export function highlightKnowledge(text, query) {
  const value = String(text || '');
  const terms = searchTerms(query);
  const lower = value.toLocaleLowerCase();
  let output = '',
    index = 0;
  while (index < value.length) {
    const term = terms.find(term => lower.startsWith(term, index));
    if (term) {
      output += `<mark>${esc(value.slice(index, index + term.length))}</mark>`;
      index += term.length;
    } else {
      output += esc(value[index]);
      index++;
    }
  }
  return output;
}
