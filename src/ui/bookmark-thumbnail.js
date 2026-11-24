import { esc } from '../core/utils.js';
import { isRussian } from '../core/i18n.js';
import { S } from '../core/store.js';
import { getActiveWorkspace } from '../core/api.js';

export function bookmarkThumbnail(link, host, { action = 'viewBookmarkPage', id = link.id } = {}) {
  const scope = getActiveWorkspace();
  const ref = link.pageSnapshots?.find(row => row.format === 'html' && !row.isArchived) || link.pageSnapshots?.find(row => row.format === 'html');
  const version = encodeURIComponent(ref?.id || link.updated_at || link.created_at || '1');
  return `<button class="bookmark-thumbnail" data-a="${esc(action)}" data-id="${esc(id)}" aria-label="${esc((isRussian() ? 'Просмотр страницы: ' : 'View page: ') + (link.title || host))}"><span class="bookmark-thumbnail-fallback" aria-hidden="true"><span>${esc(host.slice(0, 1).toUpperCase())}</span><small>${esc(host)}</small></span><img src="/api/bookmark-pages/${encodeURIComponent(link.id)}/image?workspace=${encodeURIComponent(scope)}&account=${encodeURIComponent(S.ui.currentUser?.id || '')}&v=${version}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"></button>`;
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
document.addEventListener(
  'load',
  async event => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement) || !image.closest('.bookmark-thumbnail')) return;
    try {
      await image.decode();
      if (image.naturalWidth) image.classList.add('is-decoded');
    } catch {
      /* The domain remains visible when decoding fails. */
    }
  },
  true,
);
