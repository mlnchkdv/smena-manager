import { S } from '../core/store.js';
import { getSessionGeneration } from '../core/api.js';
import { render } from '../shell/render.js';
import { t } from '../core/i18n.js';

let content, loading, failed;
const active = () => S.ui.drawer || S.ui.knowledgeDrawer || S.ui.modals.length || S.ui.palette || S.ui.pop;
const context = () => `${S.ui.currentUser?.id}:${getSessionGeneration()}`;
export function retryOverlays() {
  failed = false;
  S.ui.overlayLoadFailed = false;
  render();
}
export function renderLayer() {
  if (!active()) {
    S.ui.overlayLoadFailed = false;
    return '';
  }
  if (content) return content.renderLayer();
  if (!loading && !failed) {
    const owner = context();
    loading = import('./drawer-content.js')
      .then(module => {
        content = module;
        S.ui.overlayLoadFailed = false;
        if (owner !== context() || !active()) return;
        render();
        const box = document.querySelector('.modal, .knowledge-drawer, .drawer, .palette, .pop.floating');
        const focus =
          box?.querySelector('[autofocus]:not([disabled])') ||
          box?.querySelector('input:not([disabled]):not([type="hidden"]),textarea:not([disabled]),button:not([disabled])');
        (focus || box)?.focus({ preventScroll: true });
      })
      .catch(() => {
        failed = true;
        if (owner === context()) S.ui.overlayLoadFailed = true;
        if (owner === context() && active()) render();
      })
      .finally(() => {
        loading = null;
      });
  }
  const close = S.ui.modals.length
    ? 'closeModal'
    : S.ui.knowledgeDrawer
      ? 'closeKnowledgeDrawer'
      : S.ui.drawer
        ? 'closeDrawer'
        : S.ui.palette
          ? 'closePalette'
          : 'closePop';
  return `<div class="scrim"></div><div class="modal-wrap"><section class="modal sm" role="dialog" aria-modal="true" aria-label="${t('Loading…')}" tabindex="-1"><div class="modal-b" role="status">${t(failed ? 'Unable to load this action. Reload the page and try again.' : 'Loading…')}</div><div class="modal-f">${failed ? `<button class="btn btn-secondary" data-a="retryOverlays">${t('Try again')}</button>` : ''}<button class="btn btn-secondary" data-a="${close}">${t('Close')}</button></div></section></div>`;
}
