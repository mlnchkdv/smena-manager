import { $$ } from '../core/utils.js';
import { S } from '../core/store.js';
import { focusKey, render, syncBrowserLocation } from '../shell/render.js';
export { TEMPLATES, SHORTCUTS } from './modal-data.js';
export const fileModalRenderers = {};
export const workspaceModalRenderers = {};
export function openModal(m, opener) {
  S.ui.modalOpeners = S.ui.modalOpeners || [];
  S.ui.modalOpeners[S.ui.modals.length] = S.ui.popOpener && S.ui.pop ? S.ui.popOpener : focusKey(opener || document.activeElement);
  if (m.type === 'filePreview' && m.previewContext?.pageKey && opener) {
    const content = opener.closest('#main-content');
    if (content) m.previewContext.catalogReturn = { path: location.pathname, focus: focusKey(opener), scroll: content.scrollTop };
  }
  S.ui.modals.push(m);
  if (m.type === 'filePreview' && m.previewContext?.pageKey) syncBrowserLocation({ push: true, fromFileCatalog: true });
  S.ui.pop = null;
  render(m.previewContext?.catalogReturn && m.file?.mimeType === 'application/pdf' ? m : undefined);
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
    if (last.classList.contains('html-reader') || (m.type === 'knowledgeMove' && matchMedia('(max-width:640px)').matches)) {
      const heading = last?.querySelector('h2');
      heading?.setAttribute('tabindex', '-1');
      heading?.focus({ preventScroll: true });
      return;
    }
    const af = last?.querySelector('[autofocus]');
    (af || last?.querySelector('input,textarea,button'))?.focus();
  }, 30);
}
export function closeModal(returnToCatalog = false) {
  if (returnToCatalog === true && S.ui.modals.at(-1)?.type === 'filePreview' && history.state?.fromFileCatalog) {
    history.back();
    return;
  }
  if (S.ui.modals.at(-1)?.beforeClose?.() === false) return;
  // A nested preflight review must settle while its parent import owns the lock.
  // The parent remains protected from dismissal until the operation completes.
  if (S.ui.atomicOperation && !S.ui.modals.at(-1)?.allowAtomicClose) {
    S.ui.modals.at(-1)?.requestClose?.();
    return;
  }
  const closed = S.ui.modals.pop();
  S.ui.pop = null;
  render();
  closed?.onClose?.();
}
