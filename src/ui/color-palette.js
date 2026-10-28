import { esc } from '../core/utils.js';
import { t } from '../core/i18n.js';
import { ic } from '../core/icons.js';

export const AVATAR_COLORS = [
  ['#5A67D8', 'indigo'],
  ['#C54B78', 'rose'],
  ['#3B82C4', 'blue'],
  ['#23918A', 'teal'],
  ['#C48A1E', 'amber'],
  ['#8662C9', 'violet'],
];
export const WORKSPACE_COLORS = [['#2F2E2A', 'graphite'], ...AVATAR_COLORS.slice(0, 5)];

export function colorPalette({ label, value, colors, action, key, size = 22 }) {
  const options = [...colors];
  if (!options.some(([id]) => id === value) && /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(value || '')) options.push([value, 'Current color']);
  const focus = options.some(([id]) => id === value) ? value : options[0]?.[0];
  return `<div class="swatches" role="radiogroup" aria-label="${esc(t(label))}">${options.map(([id, name, color]) => `<button type="button" class="sw${value === id ? ' on' : ''}" style="--c:${esc(color || id)};--swatch-size:${size}px" role="radio" aria-checked="${value === id}" tabindex="${focus === id ? 0 : -1}" data-a="${esc(action)}" ${key ? `data-k="${esc(key)}"` : ''} data-v="${esc(id)}" aria-label="${esc(`${t(label)}: ${t(name)}`)}" title="${esc(t(name))}">${value === id ? ic('check', 13) : ''}</button>`).join('')}</div>`;
}

export function moveColorFocus(event) {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  const current = event.target.closest?.('.sw[role="radio"]');
  const group = current?.closest('.swatches[role="radiogroup"]');
  if (!group || !['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return false;
  const items = [...group.querySelectorAll('.sw:not(:disabled)')];
  const index = items.indexOf(current);
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? items.length - 1
        : (index + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : items.length - 1)) % items.length;
  event.preventDefault();
  const target = items[next];
  target?.focus();
  target?.click();
  return true;
}
