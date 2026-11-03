export function selectPaletteIndex(index, scroll = false, root = document) {
  const rows = [...root.querySelectorAll('#pal-list [role="option"]')];
  const selected = Math.max(0, Math.min(rows.length - 1, index));
  rows.forEach((row, i) => {
    row.classList.toggle('hl', i === selected);
    row.setAttribute('aria-selected', String(i === selected));
  });
  const input = root.querySelector('#pal-in');
  if (rows[selected]) {
    input?.setAttribute('aria-activedescendant', rows[selected].id);
    if (scroll) rows[selected].scrollIntoView({ block: 'nearest' });
  } else input?.removeAttribute('aria-activedescendant');
  return selected;
}
