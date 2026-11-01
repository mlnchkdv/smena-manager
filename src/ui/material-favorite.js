import { isFavorite } from '../core/favorites.js';
import { esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { t } from '../core/i18n.js';
export function materialFavorite(kind, record) {
  const on = isFavorite(kind, record);
  return `<button class="ibtn ibtn-xs material-star" data-a="toggleFavoriteMaterial" data-key="${esc(kind + ':' + record.id)}" aria-pressed="${on}" aria-label="${esc(t(on ? 'Remove from favorites' : 'Add to favorites'))}: ${esc(record.name || record.title || record.id)}" style="${on ? 'color:var(--amber)' : ''}">${ic('star', 14)}</button>`;
}
