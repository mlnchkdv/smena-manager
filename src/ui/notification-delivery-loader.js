import { S } from '../core/store.js';
import { render } from '../shell/render.js';
import { isRussian } from '../core/i18n.js';
let loaded,
  pending,
  failed = false;
export function deliveryStatusPanel() {
  if (S.ui.currentUser?.role !== 'admin') return '';
  if (loaded) return loaded.deliveryStatusPanel();
  if (!pending && !failed)
    pending = import('./notification-delivery-panel.js')
      .then(module => {
        loaded = module;
        render();
      })
      .catch(() => {
        failed = true;
        render();
      });
  return `<p role="status" translate="no">${isRussian() ? (failed ? 'Не удалось загрузить диагностику. Обновите страницу.' : 'Загрузка диагностики…') : failed ? 'Diagnostics could not load. Reload the page.' : 'Loading diagnostics…'}</p>`;
}
