import { ic } from '../core/icons.js';
import { esc } from '../core/utils.js';
import { t } from '../core/i18n.js';
import { readLayoutPreference, writeLayoutPreference } from '../core/view-layout-preferences.js';

let active;
const widthControls = new WeakMap();
const observed = new Map();
let measureFrame = 0;
function measureTableTools() {
  measureFrame = 0;
  for (const [wrapper, { table, tools, columns }] of observed) {
    if (!wrapper.isConnected) {
      observer?.unobserve(wrapper);
      observer?.unobserve(table);
      observed.delete(wrapper);
      continue;
    }
    // Hide decorative controls on ordinary tables that fit the reader.
    tools.hidden = columns < 6 && table.scrollWidth <= wrapper.clientWidth + 2;
  }
}
function scheduleTableMeasurement() {
  if (!measureFrame) measureFrame = requestAnimationFrame(measureTableTools);
}
const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(scheduleTableMeasurement) : null;
window.addEventListener('resize', scheduleTableMeasurement, { passive: true });
function toggleTableWidth() {
  const wide = !readLayoutPreference('knowledge-table-wide', false);
  writeLayoutPreference('knowledge-table-wide', wide);
  document.querySelectorAll('.knowledge-table-wrap[data-reading-columns]').forEach(item => setTableWidth(item, wide));
  document.querySelectorAll('[data-knowledge-table-width]').forEach(button => button.setAttribute('aria-pressed', String(wide)));
}
function setTableWidth(wrapper, wide = readLayoutPreference('knowledge-table-wide', false)) {
  wrapper.classList.toggle('is-wide-table', wide);
  wrapper.dataset.readingColumns = 'true';
  wrapper.style.setProperty('--table-columns', wrapper.querySelectorAll('thead th').length || 1);
  const controls = widthControls.get(wrapper);
  if (controls) {
    controls.button.setAttribute('aria-pressed', String(wide));
    controls.hint.hidden = !wide;
  }
  scheduleTableMeasurement();
}
function tableWidthTools(wrapper) {
  const tools = document.createElement('div');
  tools.className = 'knowledge-table-width-tools';
  const button = document.createElement('button');
  button.className = 'btn btn-ghost btn-sm';
  button.textContent = t('Wide columns');
  const hint = document.createElement('span');
  hint.className = 'hint knowledge-table-scroll-hint';
  hint.textContent = t('Scroll sideways to read all columns.');
  widthControls.set(wrapper, { button, hint });
  button.addEventListener('click', toggleTableWidth);
  tools.append(button, hint);
  setTableWidth(wrapper);
  return tools;
}

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
  expanded.before(tableWidthTools(expanded));
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
    if (columns < 2) return;
    const tools = document.createElement('div');
    tools.className = 'knowledge-table-tools';
    tools.append(tableWidthTools(wrapper));
    const button = document.createElement('button');
    button.className = 'btn btn-ghost btn-sm';
    button.setAttribute('aria-label', `${t('Expand table')}: ${wrapper.getAttribute('aria-label') || t('Table')}`);
    button.innerHTML = `${ic('maximize-2', 14)}<span>${esc(t('Expand table'))}</span>`;
    button.addEventListener('click', () => expandTable(wrapper, button));
    tools.append(button);
    wrapper.before(tools);
    observed.set(wrapper, { table, tools, columns });
    observer?.observe(wrapper);
    observer?.observe(table);
  });
  const menu = document.querySelector('.knowledge-reader-actions > div');
  if (menu && document.querySelector('.knowledge-quick-content .knowledge-table-wrap') && !menu.querySelector('[data-knowledge-table-width]')) {
    const button = document.createElement('button');
    button.className = 'btn btn-ghost';
    button.dataset.knowledgeTableWidth = 'true';
    button.textContent = t('Wide columns');
    button.setAttribute('aria-pressed', String(readLayoutPreference('knowledge-table-wide', false)));
    button.addEventListener('click', toggleTableWidth);
    menu.append(button);
  }
  scheduleTableMeasurement();
}
