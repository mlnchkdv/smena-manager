import test from 'node:test';
import assert from 'node:assert/strict';
import { folderPins, folderDestinationLocation, validFolderPins } from '../../src/shared/knowledge-folder-shortcuts.js';
import { applyPersonalSettings } from '../../src/shared/personal-settings.js';
test('folder destinations preserve search page and scroll when returning to a parent', () => {
  const first = { folder: 'parent', query: 'deep', offset: 60 };
  const child = folderDestinationLocation(first, 'child', 340);
  assert.equal(child.query, '');
  const back = folderDestinationLocation(child, 'parent');
  assert.equal(back.query, 'deep');
  assert.equal(back.offset, 60);
  assert.equal(back.returnScroll, 340);
});
test('folder pins ignore missing destinations and remain scoped to their owner', () => {
  assert.equal(validFolderPins(['a', 'a']), false);
  assert.equal(validFolderPins(Array.from({ length: 21 }, (_, i) => String(i))), false);
  assert.deepEqual(folderPins('["a","b"]', [{ id: 'a' }]), ['a']);
  const db = { members: [{ id: 'one' }, { id: 'two' }] };
  applyPersonalSettings(db, 'one', { preferences: { knowledgeFolderPins: '["a"]' } });
  assert.equal(db._userPrefs.two, undefined);
});
