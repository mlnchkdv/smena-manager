// Enhance ordinary anchor links; every panel remains readable without JavaScript.
const tablist = document.querySelector('.demo-tabs');
const tabs = [...(tablist?.querySelectorAll('a') || [])];
if (tabs.length) {
  tablist.setAttribute('role', 'tablist');
  function select(tab, focus = false) {
    for (const item of tabs) {
      const selected = item === tab;
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
      document.getElementById(item.getAttribute('aria-controls')).hidden = !selected;
    }
    if (focus) tab.focus();
  }
  for (const tab of tabs) {
    const id = tab.hash.slice(1);
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', id);
    const panel = document.getElementById(id);
    panel.setAttribute('role', 'tabpanel');
    panel.tabIndex = 0;
    tab.addEventListener('click', event => {
      event.preventDefault();
      select(tab);
    });
    tab.addEventListener('keydown', event => {
      let index = tabs.indexOf(tab);
      if (event.key === 'ArrowRight') index = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') index = (index + tabs.length - 1) % tabs.length;
      else if (event.key === 'Home') index = 0;
      else if (event.key === 'End') index = tabs.length - 1;
      else return;
      event.preventDefault();
      select(tabs[index], true);
    });
  }
  select(tabs.find(tab => tab.hash === location.hash) || tabs[0]);
}
