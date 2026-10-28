import { ic } from '../core/icons.js';
import { esc } from '../core/utils.js';
import { t } from '../core/i18n.js';

let active;

function expandTable(wrapper, opener) {
  if (active) return;
  const table = wrapper.querySelector('table');
  if (!table) return;
  const dialog = document.createElement('dialog');
  dialog.className = 'knowledge-table-dialog';
  dialog.setAttribute('aria-labelledby', 'knowledge-table-dialog-title');
  dialog.innerHTML = `<header><h2 id="knowledge-table-dialog-title">${esc(t('Table'))}</h2><button class="ibtn" aria-label="${esc(t('Close table'))}" autofocus>${ic('x', 18)}</button></header><div class="knowledge-table-expanded knowledge-table-wrap" role="region" tabindex="0" aria-label="${esc(wrapper.getAttribute('aria-label') || t('Table'))}"></div>`;
  const expanded = dialog.querySelector('.knowledge-table-expanded');
  expanded.style.setProperty('--table-columns', table.querySelectorAll('thead th').length || 1);
  const clone = table.cloneNode(true);
  clone.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
  expanded.append(clone);
  const body = opener.closest('.knowledge-drawer-body');
  const scroll = body?.scrollTop;
  let returnFocus = true;
  const sourceActions = [...table.querySelectorAll('[data-a]')];
  const cloneActions = [...clone.querySelectorAll('[data-a]')];
  dialog.addEventListener('click', event => {
    const action = event.target.closest('[data-a]');
    if (action && cloneActions.includes(action)) {
      event.preventDefault();
      event.stopPropagation();
      returnFocus = false;
      dialog.close();
      sourceActions[cloneActions.indexOf(action)]?.click();
    }
  });
  dialog.querySelector('header button').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
  });
  // Let the native dialog handle Tab and Escape without activating page shortcuts.
  dialog.addEventListener('keydown', event => event.stopPropagation());
  dialog.addEventListener('close', () => {
    dialog.remove();
    if (active?.dialog === dialog) active = null;
    if (returnFocus && opener.isConnected) {
      if (body?.isConnected) body.scrollTop = scroll;
      opener.focus({ preventScroll: true });
    }
  });
  document.body.append(dialog);
  active = { dialog, opener };
  dialog.showModal();
}

export function refreshKnowledgeTables() {
  // Never retain a copy of a note after a route, workspace or session render.
  if (active && !active.opener.isConnected) {
    active.dialog.close();
    active.dialog.remove();
    active = null;
  }
  document.querySelectorAll('.knowledge-quick-content .knowledge-table-wrap').forEach(wrapper => {
    if (wrapper.dataset.expandable) return;
    wrapper.dataset.expandable = 'true';
    const table = wrapper.querySelector('table');
    const columns = table?.querySelectorAll('thead th').length || 0;
    if (columns < 3 && ![...wrapper.querySelectorAll('th,td')].some(cell => cell.textContent.length > 160)) return;
    const tools = document.createElement('div');
    tools.className = 'knowledge-table-tools';
    const button = document.createElement('button');
    button.className = 'btn btn-ghost btn-sm';
    button.innerHTML = `${ic('maximize-2', 14)}<span>${esc(t('Expand table'))}</span>`;
    button.addEventListener('click', () => expandTable(wrapper, button));
    tools.append(button);
    wrapper.before(tools);
  });
}
