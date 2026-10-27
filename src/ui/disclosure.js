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
  const nav = document.querySelector('.bottomnav')?.getBoundingClientRect().height || 0;
  document.querySelectorAll('.ui-menu[open] > div').forEach(panel => {
    if (!['absolute', 'fixed'].includes(getComputedStyle(panel).position)) return;
    panel.style.translate = 'none';
    const box = panel.getBoundingClientRect();
    const x = Math.max(8 - box.left, Math.min(0, innerWidth - 8 - box.right));
    const y = Math.max(8 - box.top, Math.min(0, innerHeight - nav - 8 - box.bottom));
    panel.style.translate = `${x}px ${y}px`;
  });
}
export function closeActionMenus(except = null) {
  document.querySelectorAll('.ui-menu[open]').forEach(menu => {
    if (menu !== except) setMenuOpen(menu, false);
  });
}
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
