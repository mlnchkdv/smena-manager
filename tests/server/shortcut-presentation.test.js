import test from 'node:test';
import assert from 'node:assert/strict';
import { shortcutPresentation as present } from '../../src/shared/shortcut-presentation.js';
test('navigation sequences differ from modifier chords and directional alternatives', () => {
  assert.equal(present('G H').kind, 'sequence');
  assert.equal(present(['G', 'I']).separator, 'then');
  for (const value of ['Ctrl ⇧ L', '⌘ ⇧ L', ['Ctrl', 'K']]) assert.equal(present(value).separator, '+');
  assert.equal(present(['↑', '↓']).kind, 'alternative');
  assert.deepEqual(present('?').keys, ['?']);
});
