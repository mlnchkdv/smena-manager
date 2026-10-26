import { esc } from '../core/utils.js';

/** Exclusive view/filter choices use native buttons, rather than tabs without panels. */
export function segmentedControl({ label, key, value, items, className = '' }) {
  return `<div class="seg ${esc(className)}" role="group" aria-label="${esc(label)}">${items.map(([id, text]) => `<button type="button" class="${value === id ? 'on' : ''}" data-a="set" data-k="${esc(key)}" data-v="${esc(id)}" aria-pressed="${value === id}">${esc(text)}</button>`).join('')}</div>`;
}
