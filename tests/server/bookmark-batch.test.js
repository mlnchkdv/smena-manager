import test from 'node:test';
import assert from 'node:assert/strict';
import { applyBookmarkBatch } from '../../src/shared/bookmark-batch.js';
const fixture = () => ({
  linkFolders: [{ id: 'a' }, { id: 'b' }],
  links: [
    { id: 'one', folder: 'a', tags: ['x'], is_read: true, favorite: true },
    { id: 'two', tags: [] },
  ],
});
test('batch move/tags/archive preserve personal and reading data and skip stale IDs', () => {
  const data = fixture();
  assert.deepEqual(applyBookmarkBatch(data, ['one', 'two', 'gone'], { type: 'move', folder: 'b' }, 'editor').failed, ['gone']);
  assert.equal(data.links[0].folder, 'b');
  applyBookmarkBatch(data, ['one'], { type: 'addTag', tag: 'y' }, 'editor');
  assert.deepEqual(data.links[0].tags, ['x', 'y']);
  applyBookmarkBatch(data, ['one'], { type: 'removeTag', tag: 'x' }, 'editor');
  applyBookmarkBatch(data, ['one'], { type: 'archive' }, 'editor');
  assert.equal(data.links[0].is_archived, true);
  assert.equal(data.links[0].is_read, true);
  assert.equal(data.links[0].favorite, true);
  applyBookmarkBatch(data, ['one'], { type: 'restore' }, 'editor');
  assert.equal(data.links[0].is_archived, false);
});
test('read-only, invalid destination and oversized batches fail before changes', () => {
  const data = fixture(),
    before = structuredClone(data);
  assert.throws(() => applyBookmarkBatch(data, ['one'], { type: 'archive' }, 'viewer'));
  assert.throws(() => applyBookmarkBatch(data, ['one'], { type: 'move', folder: 'gone' }, 'editor'));
  assert.throws(() =>
    applyBookmarkBatch(
      data,
      Array.from({ length: 61 }, (_, i) => '' + i),
      { type: 'archive' },
      'admin',
    ),
  );
  assert.deepEqual(data, before);
});
