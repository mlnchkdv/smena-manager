import { $$ } from '../core/utils.js';
import { S } from '../core/store.js';
import { focusKey, render } from '../shell/render.js';
export { TEMPLATES, SHORTCUTS } from './modal-data.js';
export const fileModalRenderers = {};
export const workspaceModalRenderers = {};
export function openModal(m) {
  S.ui.modalOpeners = S.ui.modalOpeners || [];
  S.ui.modalOpeners[S.ui.modals.length] = S.ui.popOpener && S.ui.pop ? S.ui.popOpener : focusKey(document.activeElement);
  S.ui.modals.push(m);
  S.ui.pop = null;
  render();
  setTimeout(() => {
    if (S.ui.modals.at(-1) !== m) return;
    const all = $$('.modal');
    const last = all[all.length - 1];
    if (!last?.isConnected) return;
    // A fast keyboard, paste or autofill can already be editing another field.
    // Delayed focus must not redirect that input into the autofocus field.
    if (last.contains(document.activeElement) && document.activeElement.matches('input,textarea,select,[contenteditable]')) return;
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
  if (S.ui.atomicOperation) {
    S.ui.modals.at(-1)?.requestClose?.();
    return;
  }
  const closed = S.ui.modals.pop();
  S.ui.pop = null;
  render();
  closed?.onClose?.();
}
