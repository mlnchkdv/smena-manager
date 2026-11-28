import { esc } from '../core/utils.js';

/** Exclusive view/filter choices use native buttons, rather than tabs without panels. */
export function segmentedControl({ label, key, value, items, className = '', action = 'set' }) {
  return `<div class="seg ${esc(className)}" role="group" aria-label="${esc(label)}">${items.map(([id, text, count]) => `<button type="button" class="${value === id ? 'on' : ''}" data-a="${esc(action)}" data-k="${esc(key)}" data-v="${esc(id)}" aria-pressed="${value === id}"><span>${esc(text)}</span>${Number.isInteger(count) ? ` <span class="num faint">${count}</span>` : ''}</button>`).join('')}</div>`;
}
