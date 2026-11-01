import { S } from '../core/store.js';

// A diagram is a workspace surface, never the owner of an overlay above it.
export function overlayAboveDiagram() {
  return !!(
    S.ui.auth ||
    S.ui.palette ||
    S.ui.modals.length ||
    S.ui.knowledgeDrawer ||
    S.ui.drawer ||
    S.ui.pop ||
    S.ui.mnav ||
    document.querySelector('.select-menu')
  );
}

export function trapSurfaceTab(event, box) {
  if (!box || event.key !== 'Tab') return false;
  const items = [
    ...box.querySelectorAll(
      'a[href],summary,button:not([disabled]),input:not([type=hidden]):not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex], [contenteditable="true"]',
    ),
  ].filter(el => {
    if (el.tabIndex < 0 || !el.getClientRects().length || el.closest('[inert],[aria-hidden="true"]') || getComputedStyle(el).visibility === 'hidden')
      return false;
    for (let parent = el.parentElement; parent && parent !== box; parent = parent.parentElement)
      if (parent.matches('details:not([open])') && !parent.querySelector(':scope > summary')?.contains(el)) return false;
    return true;
  });
  const index = items.indexOf(document.activeElement);
  if (items.length && (index < 0 || (event.shiftKey ? index === 0 : index === items.length - 1))) {
    event.preventDefault();
    items[event.shiftKey ? items.length - 1 : 0].focus({ preventScroll: true });
    return true;
  }
  return false;
}
