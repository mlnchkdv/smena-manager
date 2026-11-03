import test from 'node:test';
import assert from 'node:assert/strict';
import { selectPaletteIndex } from '../../src/ui/palette-selection.js';

test('palette pointer and keyboard selection share CSS and ARIA, including empty results', () => {
  const input = {
    attrs: {},
    setAttribute(k, v) {
      this.attrs[k] = v;
    },
    removeAttribute(k) {
      delete this.attrs[k];
    },
  };
  const rows = Array.from({ length: 3 }, (_, i) => ({
    id: 'pi-' + i,
    attrs: {},
    classList: {
      toggle(_k, on) {
        this.on = on;
      },
    },
    setAttribute(k, v) {
      this.attrs[k] = v;
    },
    scrollIntoView() {
      this.scrolled = true;
    },
  }));
  const root = { querySelectorAll: () => rows, querySelector: () => input };
  assert.equal(selectPaletteIndex(2, false, root), 2);
  assert.equal(input.attrs['aria-activedescendant'], 'pi-2');
  assert.deepEqual(
    rows.map(r => r.attrs['aria-selected']),
    ['false', 'false', 'true'],
  );
  selectPaletteIndex(1, true, root);
  assert.equal(rows[1].scrolled, true);
  assert.deepEqual(
    rows.map(r => r.classList.on),
    [false, true, false],
  );
  rows.length = 0;
  selectPaletteIndex(0, false, root);
  assert.equal(input.attrs['aria-activedescendant'], undefined);
});
