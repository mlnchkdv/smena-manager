import { esc } from '../core/utils.js';

export function filePagePending(page, view = 'grid') {
  if (page.error)
    return `<div class="panel file-page-pending" role="alert"><p>${esc(page.error)}</p><button class="btn btn-secondary" data-a="retryFileCatalog">Try again</button></div>`;
  const row = '<span class="file-skeleton-icon"></span><span class="file-skeleton-lines"><i></i><i></i></span>';
  return `<section class="file-page-loading" aria-busy="true" aria-label="Loading files…"><p class="hint" role="status">Loading files…</p><div class="${view === 'list' ? 'file-skeleton-list' : 'fgrid workspace-file-grid'}" aria-hidden="true">${Array.from({ length: view === 'list' ? 5 : 3 }, () => `<div class="${view === 'list' ? 'file-skeleton-row' : 'fcard file-skeleton-card'}">${row}</div>`).join('')}</div></section>`;
}
