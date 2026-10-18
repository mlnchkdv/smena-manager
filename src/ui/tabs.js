export function normalizeTablists(root = document) {
  [...root.querySelectorAll('[role="tablist"]')].forEach((list, listIndex) => {
    const tabs = [...list.querySelectorAll(':scope > button')];
    const selected = tabs.find(tab => tab.classList.contains('on')) || tabs.find(tab => tab.getAttribute('aria-selected') === 'true') || tabs[0];
    for (const [index, tab] of tabs.entries()) {
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(tab === selected));
      tab.tabIndex = tab === selected ? 0 : -1;
      tab.id ||= `smena-tab-${listIndex}-${index}`;
    }
  });
}

export function moveTabFocus(event) {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  const tab = event.target.closest?.('[role="tab"]');
  const list = tab?.closest('[role="tablist"]');
  if (!list) return false;
  const vertical = list.getAttribute('aria-orientation') === 'vertical';
  const forward = vertical ? 'ArrowDown' : 'ArrowRight';
  const backward = vertical ? 'ArrowUp' : 'ArrowLeft';
  if (![forward, backward, 'Home', 'End'].includes(event.key)) return false;
  const tabs = [...list.querySelectorAll('[role="tab"]')].filter(item => !item.disabled && item.offsetParent !== null);
  if (!tabs.length) return false;
  const index = tabs.indexOf(tab);
  const target = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === forward ? 1 : tabs.length - 1)) % tabs.length;
  event.preventDefault();
  tabs.forEach(item => {
    item.tabIndex = -1;
  });
  tabs[target].tabIndex = 0;
  tabs[target].focus();
  return true;
}
