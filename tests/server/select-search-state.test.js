import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function fixture() {
  const input = {
    value: 'Frontend',
    selectionStart: 3,
    selectionEnd: 6,
    dispatchEvent() {},
    setSelectionRange(start, end) {
      this.range = [start, end];
    },
  };
  const active = { dataset: { i: '1' } };
  const old = { value: 'note:1', options: [{ value: 'task:1' }, { value: 'task:2' }], hasAttribute: () => true };
  const sel = { value: 'note:1', options: [{ value: 'task:2' }, { value: 'task:1' }], matches: () => true };
  const btn = { dataset: { focusSelect: 'page:graph-locate:0' }, previousElementSibling: sel, offsetParent: {}, closest: () => null };
  let focus = '',
    opened = 0;
  const option = {
    dataset: { i: '0' },
    focus: () => {
      focus = 'task:2';
    },
  };
  const menu = { contains: () => true, querySelector: () => input, querySelectorAll: () => [option] };
  const context = {
    S: { ui: { currentUser: { id: 'owner' }, route: 'files', params: {}, modals: [] } },
    D: () => ({ ws: { id: 'workspace' } }),
    document: { activeElement: active, querySelector: () => btn, addEventListener() {} },
    window: {},
    addEventListener() {},
    CSS: { escape: value => value },
    Event: class {},
  };
  const source = readFileSync(new URL('../../src/ui/select.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '')
    .replace(/^export /gm, '');
  vm.runInNewContext(source + '\nthis.menu = selectMenu; this.scope = selectionScope;', context);
  Object.assign(context.menu, {
    el: menu,
    sel: old,
    btn,
    scope: context.scope(),
    open() {
      opened++;
      this.el = menu;
    },
  });
  return { menu: context.menu, input, sel, btn, old, ui: context.S.ui, opened: () => opened, focused: () => focus };
}

test('a background rebuild preserves query, caret and active option by value after reordering', () => {
  const f = fixture();
  const state = f.menu.capture();
  f.input.value = '';
  f.menu.restore(state);
  assert.equal(f.opened(), 1);
  assert.equal(f.input.value, 'Frontend');
  assert.deepEqual(f.input.range, [3, 6]);
  assert.equal(f.focused(), 'task:2');
});

test('ordinary non-search selects survive a background rebuild but never a navigation/account change', () => {
  const f = fixture();
  f.old.hasAttribute = () => false;
  f.menu.el.scrollTop = 130;
  const saved = f.menu.capture();
  f.menu.restore(saved);
  assert.equal(f.opened(), 1);
  assert.equal(f.menu.el.scrollTop, 130);
  f.ui.route = 'settings';
  f.menu.restore(saved);
  assert.equal(f.opened(), 1);
  f.ui.route = 'files';
  f.ui.currentUser.id = 'other';
  f.menu.restore(saved);
  assert.equal(f.opened(), 1);
});

test('search is not reopened for changed values, hidden/disabled triggers or inert surfaces', () => {
  for (const change of [
    f => {
      f.sel.value = 'other';
    },
    f => {
      f.sel.disabled = true;
    },
    f => {
      f.btn.offsetParent = null;
    },
    f => {
      f.btn.closest = () => ({});
    },
    f => {
      f.sel.matches = () => false;
    },
  ]) {
    const f = fixture();
    const state = f.menu.capture();
    change(f);
    f.menu.restore(state);
    assert.equal(f.opened(), 0);
  }
});
