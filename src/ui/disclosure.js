import { D, S } from '../core/store.js';
import { esc } from '../core/utils.js';
import { t } from '../core/i18n.js';

let scope;
let expanded = new Set();
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
