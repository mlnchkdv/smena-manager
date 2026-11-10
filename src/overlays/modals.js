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
    // Keep an already chosen field, including enhanced select triggers and
    // their portalled options. A late autofocus must not steal keyboard input.
    const active = document.activeElement;
    if (last.contains(active) && active.matches('input,textarea,select,[contenteditable],.select-btn,[role="combobox"]')) return;
    if (document.querySelector('.select-menu')?.contains(active)) return;
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
  if (S.ui.modals.at(-1)?.beforeClose?.() === false) return;
  if (S.ui.atomicOperation) {
    S.ui.modals.at(-1)?.requestClose?.();
    return;
  }
  const closed = S.ui.modals.pop();
  S.ui.pop = null;
  render();
  closed?.onClose?.();
}
