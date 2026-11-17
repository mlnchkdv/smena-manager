import { esc } from '../core/utils.js';
import { isRussian } from '../core/i18n.js';
import { S } from '../core/store.js';
import { getActiveWorkspace } from '../core/api.js';

export function bookmarkThumbnail(link, host) {
  const scope = getActiveWorkspace();
  return `<button class="bookmark-thumbnail" data-a="viewBookmarkPage" data-id="${esc(link.id)}" aria-label="${esc((isRussian() ? 'Просмотр страницы: ' : 'View page: ') + (link.title || host))}"><span class="bookmark-thumbnail-fallback" aria-hidden="true"><span>${esc(host.slice(0, 1).toUpperCase())}</span><small>${esc(host)}</small></span><img src="/api/bookmark-pages/${encodeURIComponent(link.id)}/image?workspace=${encodeURIComponent(scope)}&account=${encodeURIComponent(S.ui.currentUser?.id || '')}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"></button>`;
}

// No inline error handlers: keep the application's script CSP intact.
document.addEventListener(
  'error',
  event => {
    const image = event.target;
    if (image instanceof HTMLImageElement && image.closest('.bookmark-thumbnail')) image.hidden = true;
  },
  true,
);
