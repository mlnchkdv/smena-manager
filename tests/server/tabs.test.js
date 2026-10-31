import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTablists, moveTabFocus } from '../../src/ui/tabs.js';

test('shared tabs expose one selected tab and use manual keyboard activation', () => {
  let focus;
  const list = { getAttribute: () => null, querySelectorAll: () => tabs };
  const tabs = Array.from({ length: 3 }, (_, index) => ({
    id: `members-tab-${index}`,
    attributes: {},
    classList: { contains: () => index === 0 },
    offsetParent: {},
    setAttribute(key, value) {
      this.attributes[key] = value;
    },
    getAttribute(key) {
      return this.attributes[key];
    },
    closest: selector => (selector === '[role="tablist"]' ? list : tabs[index]),
    focus() {
      focus = this;
    },
  }));
  normalizeTablists({ querySelectorAll: () => [list] });
  assert.deepEqual(
    tabs.map(tab => tab.tabIndex),
    [0, -1, -1],
  );
  assert.equal(tabs[0].attributes['aria-selected'], 'true');
  for (const [key, target] of [
    ['ArrowRight', 1],
    ['End', 2],
    ['Home', 0],
    ['ArrowLeft', 2],
  ]) {
    const event = { key, target: focus || tabs[0], preventDefault() {} };
    assert.equal(moveTabFocus(event), true);
    assert.equal(focus, tabs[target]);
    assert.equal(tabs[0].attributes['aria-selected'], 'true', 'Arrow navigation changes focus; Enter/Space activates through the normal action');
  }
  assert.equal(moveTabFocus({ key: 'Enter', target: tabs[0] }), false);
});
