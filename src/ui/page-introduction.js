import { ic } from '../core/icons.js';
export function pageIntroduction(text) {
  return `<details class="ui-menu page-introduction"><summary class="ibtn" aria-label="About this view" title="About this view">${ic('info', 16)}</summary><div><p>${text}</p></div></details>`;
}
