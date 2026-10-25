import { $$ } from '../core/utils.js';
import { S } from '../core/store.js';
import { focusKey, render } from '../shell/render.js';
export { TEMPLATES, SHORTCUTS } from './modal-data.js';
export const fileModalRenderers = {};
export function openModal(m) {
  S.ui.modalOpeners = S.ui.modalOpeners || [];
  S.ui.modalOpeners[S.ui.modals.length] = S.ui.popOpener && S.ui.pop ? S.ui.popOpener : focusKey(document.activeElement);
  S.ui.modals.push(m);
  S.ui.pop = null;
  render();
  setTimeout(() => {
    const all = $$('.modal');
    const last = all[all.length - 1];
    if (m.type === 'knowledgeMove' && matchMedia('(max-width:640px)').matches) {
      const heading = last?.querySelector('h2');
      heading?.setAttribute('tabindex', '-1');
      heading?.focus({ preventScroll: true });
      return;
    }
    const af = last?.querySelector('[autofocus]');
    (af || last?.querySelector('input,textarea,button'))?.focus();
  }, 30);
}
export function closeModal() {
  if (S.ui.atomicOperation) return;
  S.ui.modals.pop();
  S.ui.pop = null;
  render();
}
