import test from 'node:test';
import assert from 'node:assert/strict';
import { fileViewKey, normalizeFileView, readFileView, writeFileView } from '../../src/shared/file-view.js';
test('file view preferences validate values and are isolated by account and workspace', () => {
  const memory = new Map();
  const storage = { getItem: key => memory.get(key), setItem: (key, value) => memory.set(key, value) };
  const key = fileViewKey('u', 'w');
  assert.ok(
    writeFileView(storage, key, { view: 'list', sort: 'name', pageSize: 25, folderLayout: 'compact', foldersCollapsed: true, query: 'must not persist' }),
  );
  assert.deepEqual(readFileView(storage, key), { view: 'list', sort: 'name', pageSize: 25, folderLayout: 'compact', foldersCollapsed: true });
  assert.equal(readFileView(storage, fileViewKey('other', 'w')).view, 'grid');
  assert.equal(readFileView(storage, fileViewKey('u', 'other')).view, 'grid');
  assert.notEqual(fileViewKey('a:b', 'c'), fileViewKey('a', 'b:c'));
  assert.equal(memory.get(key).includes('must not persist'), false);
});
test('file view safely recovers from corrupt, hostile and unavailable local storage', () => {
  for (const value of [null, [], { view: 'html', sort: 'x', pageSize: 9999, foldersCollapsed: 'true' }])
    assert.deepEqual(normalizeFileView(value), normalizeFileView());
  assert.deepEqual(readFileView({ getItem: () => '{broken' }, 'k'), normalizeFileView());
  const blocked = {
    getItem() {
      throw Error('blocked');
    },
    setItem() {
      throw Error('full');
    },
  };
  assert.deepEqual(readFileView(blocked, 'k'), normalizeFileView());
  assert.equal(writeFileView(blocked, 'k', {}), false);
});
