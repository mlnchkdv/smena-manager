import { ic } from '../core/icons.js';
import { esc } from '../core/utils.js';
// Additional content is trusted renderer markup, like the surrounding page.
export function pageIntroduction(text, content = '', className = '') {
  return `<details class="ui-menu page-introduction${className ? ` ${esc(className)}` : ''}"><summary class="ibtn" aria-label="About this view" title="About this view">${ic('info', 16)}</summary><div><p>${text}</p>${content}</div></details>`;
}
