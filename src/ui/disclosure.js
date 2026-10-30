import { D, S } from '../core/store.js';
import { esc } from '../core/utils.js';
import { t } from '../core/i18n.js';

let scope;
let expanded = new Set();
function setMenuOpen(menu, open) {
  menu.open = open;
  // Synchronize remembered disclosures before an action replaces the DOM.
  menu.dispatchEvent(new Event('toggle'));
  if (open) positionActionMenus();
}
export function positionActionMenus() {
  const viewport = window.visualViewport;
  const left = (viewport?.offsetLeft || 0) + 8;
  const top = (viewport?.offsetTop || 0) + 8;
  const right = left + (viewport?.width || innerWidth) - 16;
  const edge = top + (viewport?.height || innerHeight) - 16;
  const nav = document.querySelector('.bottomnav')?.getBoundingClientRect();
  const bottom = nav?.height && nav.top < edge && nav.bottom > top ? Math.min(edge, nav.top - 8) : edge;
  document.querySelectorAll('.ui-menu[open] > div').forEach(panel => {
    if (!['absolute', 'fixed'].includes(getComputedStyle(panel).position)) return;
    const menu = panel.parentElement;
    if (menu.matches('.knowledge-folder-menu') && !matchMedia('(max-width: 900px), (pointer: coarse)').matches) {
      const anchor = menu.querySelector(':scope > summary').getBoundingClientRect();
      panel.style.inset = `${anchor.bottom + 4}px auto auto ${anchor.right - panel.offsetWidth}px`;
    } else if (menu.matches('.knowledge-folder-menu')) panel.style.removeProperty('inset');
    panel.style.translate = 'none';
    panel.style.removeProperty('max-height');
    const limit = parseFloat(getComputedStyle(panel).maxHeight);
    panel.style.maxHeight = `${Math.max(0, Math.min(Number.isFinite(limit) ? limit : Infinity, bottom - top))}px`;
    const box = panel.getBoundingClientRect();
    const x = Math.max(left - box.left, Math.min(0, right - box.right));
    const y = Math.max(top - box.top, Math.min(0, bottom - box.bottom));
    panel.style.translate = `${x}px ${y}px`;
  });
}
export function closeActionMenus(except = null) {
  document.querySelectorAll('.ui-menu[open]').forEach(menu => {
    if (menu !== except) setMenuOpen(menu, false);
  });
}
addEventListener('resize', positionActionMenus);
window.visualViewport?.addEventListener('resize', positionActionMenus);
window.visualViewport?.addEventListener('scroll', positionActionMenus);
document.addEventListener(
  'scroll',
  event => {
    const scroller = event.target;
    document.querySelectorAll('.ui-menu[open]').forEach(menu => {
      // A menu may scroll internally. Only its moving ancestors invalidate the anchor.
      if (scroller?.contains(menu) && !menu.contains(scroller)) setMenuOpen(menu, false);
    });
  },
  { capture: true, passive: true },
);
export function disclosureOpen(key) {
  const next = JSON.stringify([S.ui.currentUser?.id, D().ws.id || D().ws.url]);
  if (scope !== next) {
    scope = next;
    expanded = new Set();
  }
  return expanded.has(key);
}
export function disclosureAttributes(key) {
  return `data-ui-disclosure="${esc(key)}" ${disclosureOpen(key) ? 'open' : ''}`;
}
document.addEventListener(
  'toggle',
  event => {
    const el = event.target;
    const key = el.dataset?.uiDisclosure;
    if (!key || !el.isConnected) return;
    disclosureOpen(key);
    el.open ? expanded.add(key) : expanded.delete(key);
    expanded = new Set([...expanded].slice(-100));
    const summary = el.querySelector(':scope > summary[data-open-label]');
    if (summary) summary.textContent = t(el.open ? summary.dataset.openLabel : summary.dataset.closedLabel);
  },
  true,
);
document.addEventListener(
  'keydown',
  event => {
    if (event.key !== 'Escape') return;
    // A portalled select owns its first Escape; its parent menu closes next.
    if (event.target.closest?.('.select-menu')) return;
    const menu = [...document.querySelectorAll('.ui-menu[open]')].at(-1);
    if (!menu) return;
    setMenuOpen(menu, false);
    menu.querySelector(':scope > summary')?.focus({ preventScroll: true });
    event.preventDefault();
    event.stopImmediatePropagation();
  },
  true,
);
document.addEventListener(
  'click',
  event => {
    const summary = event.target.closest?.('summary');
    const menu = summary?.parentElement;
    if (menu?.matches('.ui-menu')) {
      event.preventDefault();
      const open = !menu.open;
      closeActionMenus(menu);
      setMenuOpen(menu, open);
      return;
    }
    const parent = event.target.closest?.('.ui-menu');
    closeActionMenus(event.target.closest?.('button[data-a],a[href]') ? null : parent);
  },
  true,
);
