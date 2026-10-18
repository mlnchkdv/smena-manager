import { esc } from '../core/utils.js';

export function paginationHtml(window, key) {
  if (window.pages < 2) return '';
  return `<nav class="row" aria-label="Pagination" style="justify-content:center;gap:12px;padding:10px;flex-wrap:wrap"><button class="btn btn-sm btn-secondary" data-a="listPage" data-key="${esc(key)}" data-page="${window.page - 1}" ${window.page === 0 ? 'disabled' : ''}>Previous</button><span class="hint"><span>Page</span> ${window.page + 1} / ${window.pages}</span><button class="btn btn-sm btn-secondary" data-a="listPage" data-key="${esc(key)}" data-page="${window.page + 1}" ${window.page + 1 === window.pages ? 'disabled' : ''}>Next</button></nav>`;
}
