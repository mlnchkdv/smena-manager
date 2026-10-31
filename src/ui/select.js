/* =====================================================================
   SELECT: every <select class="select"> renders as the design-system
   dropdown (trigger button + .pop menu) instead of the browser's native list.
   The native <select> stays in the DOM, visually hidden, as the source of
   truth, so existing `data-in` handlers and form reads keep working.
   ===================================================================== */
import { esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { t } from '../core/i18n.js';
import { knowledgeSelectOptions } from '../shared/knowledge-select-options.js';

export function enhanceSelects(root = document) {
  for (const sel of root.querySelectorAll('select.select:not([data-enhanced])')) {
    sel.dataset.enhanced = '1';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'select select-btn';
    btn.setAttribute('style', sel.getAttribute('style') || '');
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    // Rebuilt triggers need an identity independent of the selected value/locale.
    const scope = sel.closest('.modal,.drawer') || root;
    const scopeName = scope.getAttribute?.('aria-labelledby') || (scope.matches?.('.drawer') ? 'drawer' : 'page');
    const identity = sel.id || ['in', 'k', 'f', 'field', 'key', 'ctx'].map(key => sel.dataset[key] || '').join('|');
    const peers = [...scope.querySelectorAll('select.select')];
    btn.dataset.focusSelect = `${scopeName}:${identity}:${peers.indexOf(sel)}`;
    const accessibleLabel =
      sel.getAttribute('aria-label') ||
      (sel.id && document.querySelector(`label[for="${CSS.escape(sel.id)}"]`)?.textContent) ||
      sel.closest('label')?.querySelector(':scope > span')?.textContent ||
      'Choose';
    if (sel.id) btn.dataset.for = sel.id;
    const sync = () => {
      btn.disabled = sel.disabled;
      const selectedText = sel.options[sel.selectedIndex]?.text || '';
      const authored = sel.options[sel.selectedIndex]?.closest('[translate="no"]');
      btn.innerHTML = `<span class="trunc" ${authored ? 'translate="no"' : ''}>${esc(selectedText)}</span>`;
      btn.setAttribute('aria-label', `${accessibleLabel}: ${selectedText}`);
    };
    sync();
    sel.classList.add('select-native');
    sel.tabIndex = -1;
    sel.setAttribute('aria-hidden', 'true');
    sel.after(btn);
    sel.addEventListener('change', sync);
    btn.addEventListener('click', e => {
      e.stopPropagation();
      selectMenu.toggle(sel, btn);
    });
    btn.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        selectMenu.open(sel, btn);
      }
    });
  }
}

export const selectMenu = {
  el: null,
  sel: null,
  btn: null,
  toggle(sel, btn) {
    this.sel === sel && this.el ? this.close() : this.open(sel, btn);
  },
  open(sel, btn) {
    if (sel.disabled) return;
    this.close();
    const menu = document.createElement('div');
    menu.className = 'pop select-menu enter';
    menu.setAttribute('role', 'listbox');
    menu.setAttribute('data-pop-root', '');
    const searchable = sel.hasAttribute('data-searchable') || (!!sel.closest('.knowledge-shell,.knowledge-drawer') && sel.options.length > 15);
    const optionHtml = options =>
      options
        .map(
          o =>
            `<button type="button" class="mi" role="option" data-i="${o.index}" aria-selected="${o.selected}" ${o.disabled ? 'disabled' : ''}><span class="grow select-option-copy"><span class="trunc" ${sel.options[o.index]?.closest('[translate="no"]') ? 'translate="no"' : ''}>${esc(o.text)}</span>${o.context ? `<small class="select-option-context" translate="no">${esc(o.context)}</small>` : ''}</span>${o.selected ? `<span class="ck">${ic('check', 14)}</span>` : ''}</button>`,
        )
        .join('');
    if (searchable) {
      menu.classList.add('knowledge-select-menu');
      menu.removeAttribute('role');
      menu.innerHTML = `<div class="knowledge-select-search"><input class="input" aria-label="${esc(t('Search options'))}" placeholder="${esc(t('Search options'))}"></div><div role="listbox" class="knowledge-select-results"></div><p class="hint knowledge-select-hint" role="status"></p>`;
      const update = () => {
        const result = knowledgeSelectOptions(sel.options, menu.querySelector('input').value);
        menu.querySelector('.knowledge-select-results').innerHTML = optionHtml(result.options);
        menu.querySelector('.knowledge-select-hint').textContent =
          result.total > 100 ? t('Refine the search to see more options.') : result.total ? '' : t('No results found');
        menu.scrollTop = 0;
        this.position();
      };
      menu.addEventListener('input', update);
      update();
    } else
      menu.innerHTML = optionHtml(
        Array.from(sel.options, (option, index) => ({ text: option.text, selected: option.selected, disabled: option.disabled, index })),
      );
    document.body.appendChild(menu);
    menu.addEventListener('mousedown', e => {
      if (!e.target.closest('input')) e.preventDefault();
    });
    menu.addEventListener('click', e => {
      const it = e.target.closest('.mi');
      if (!it) return;
      e.stopPropagation();
      this.pick(+it.dataset.i);
    });
    let searchPrefix = '';
    let lastTyped = 0;
    menu.addEventListener('keydown', e => {
      const items = [...menu.querySelectorAll('.mi:not(:disabled)')];
      const i = items.indexOf(document.activeElement);
      const typing = e.target.matches('input,textarea,[contenteditable="true"]');
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        items[Math.min(items.length - 1, i + 1)]?.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        items[Math.max(0, i - 1)]?.focus();
      } else if (!typing && (e.key === 'Home' || e.key === 'End')) {
        e.preventDefault();
        e.stopPropagation();
        items[e.key === 'Home' ? 0 : items.length - 1]?.focus();
        searchPrefix = '';
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.close(true);
      } else if (e.key === 'Tab') this.close();
      else if (!typing && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key !== ' ' || searchPrefix)) {
        e.preventDefault();
        e.stopPropagation();
        const key = e.key.toLocaleLowerCase();
        const now = performance.now();
        searchPrefix = now - lastTyped > 700 ? key : searchPrefix + key;
        lastTyped = now;
        const repeated = [...searchPrefix].every(char => char === key);
        const query = repeated ? key : searchPrefix;
        const start = repeated ? i + 1 : Math.max(0, i);
        Array.from({ length: items.length }, (_, offset) => items[(start + offset) % items.length])
          .find(item => item.querySelector('.trunc').textContent.trim().toLocaleLowerCase().startsWith(query))
          ?.focus();
      }
    });
    Object.assign(this, { el: menu, sel, btn });
    this.position();
    btn.setAttribute('aria-expanded', 'true');
    (menu.querySelector('input') || menu.querySelector('[aria-selected="true"]:not(:disabled)') || menu.querySelector('.mi:not(:disabled)'))?.focus({
      preventScroll: true,
    });
  },
  position() {
    if (!this.el) return;
    if (!this.btn?.isConnected) return this.close();
    const { el, btn } = this;
    const viewport = window.visualViewport;
    const left = (viewport?.offsetLeft || 0) + 8;
    const top = (viewport?.offsetTop || 0) + 8;
    const width = Math.max(0, (viewport?.width || innerWidth) - 16);
    const height = Math.max(0, (viewport?.height || innerHeight) - 16);
    const r = btn.getBoundingClientRect();
    el.style.minWidth = Math.min(Math.max(r.width, 160), width) + 'px';
    el.style.maxWidth = width + 'px';
    el.style.maxHeight = Math.min(420, height) + 'px';
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const preferredTop = r.bottom + 4 + h > top + height ? r.top - 4 - h : r.bottom + 4;
    el.style.left = Math.max(left, Math.min(r.left, left + width - w)) + 'px';
    el.style.top = Math.max(top, Math.min(preferredTop, top + height - h)) + 'px';
  },
  pick(i) {
    const { sel, btn } = this;
    this.close(true);
    if (!sel || sel.disabled || !sel.options[i] || sel.options[i].disabled || sel.selectedIndex === i) return;
    sel.selectedIndex = i;
    sel.dispatchEvent(new Event('input', { bubbles: true }));
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    if (btn.isConnected) btn.focus({ preventScroll: true });
  },
  close(refocus) {
    if (!this.el) return;
    this.el.remove();
    this.btn?.setAttribute('aria-expanded', 'false');
    if (refocus && this.btn?.isConnected) this.btn.focus({ preventScroll: true });
    this.el = this.sel = this.btn = null;
  },
};
document.addEventListener(
  'mousedown',
  e => {
    if (selectMenu.el && !selectMenu.el.contains(e.target) && !e.target.closest('.select-btn')) selectMenu.close();
  },
  true,
);
addEventListener('resize', () => selectMenu.close());
window.visualViewport?.addEventListener('resize', () => selectMenu.position());
window.visualViewport?.addEventListener('scroll', () => selectMenu.position());
document.addEventListener(
  'scroll',
  e => {
    if (selectMenu.el && !selectMenu.el.contains(e.target)) selectMenu.position();
  },
  true,
);
