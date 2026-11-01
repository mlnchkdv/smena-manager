export function refreshGraphListKeyboard() {
  const rows = [...document.querySelectorAll('.graph-list-item')];
  const chosen = rows.find(el => el.getAttribute('aria-pressed') === 'true') || rows[0];
  rows.forEach(el => {
    el.tabIndex = el === chosen ? 0 : -1;
  });
}
document.addEventListener('keydown', event => {
  if (
    !event.target.matches?.('.graph-list-item') ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    !['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)
  )
    return;
  const rows = [...event.target.closest('.graph-list').querySelectorAll('.graph-list-item')];
  const at = rows.indexOf(event.target);
  const next =
    event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, at + (event.key === 'ArrowDown' ? 1 : -1)));
  event.preventDefault();
  rows.forEach((el, i) => {
    el.tabIndex = i === next ? 0 : -1;
  });
  rows[next]?.focus();
});
