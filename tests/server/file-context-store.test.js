import test from 'node:test';
import assert from 'node:assert/strict';
import { fileContextKey, normalizeFileContext, readFileContext, writeFileContext } from '../../src/shared/file-context-store.js';

test('per-tab file context isolates users, workspaces and project views without retaining selections or content', () => {
  const items = new Map(),
    storage = { getItem: k => items.get(k), setItem: (k, v) => items.set(k, v) };
  const key = fileContextKey('a', 'w', 'p');
  writeFileContext(storage, key, {
    fileQ: 'Фото_события',
    fileFolder: 'nested',
    fileProject: 'p',
    page: 4,
    scroll: 840,
    anchor: { id: 'file-82', offset: 25 },
    fileSelection: ['destructive-selection'],
    token: 'secret',
    formatted_markdown: 'body',
  });
  const restored = readFileContext(storage, key);
  assert.equal(restored.fileQ, 'Фото_события');
  assert.equal(restored.fileFolder, 'nested');
  assert.equal(restored.page, 4);
  assert.deepEqual(restored.anchor, { id: 'file-82', offset: 25 });
  for (const other of [fileContextKey('b', 'w', 'p'), fileContextKey('a', 'other', 'p'), fileContextKey('a', 'w', '')])
    assert.equal(readFileContext(storage, other), null);
  for (const forbidden of ['fileSelection', 'token', 'formatted_markdown']) assert.equal(Object.hasOwn(restored, forbidden), false);
});
test('malformed and unavailable device storage cannot break files or inject unbounded context', () => {
  const blocked = {
    getItem: () => {
      throw Error('blocked');
    },
    setItem: () => {
      throw Error('blocked');
    },
  };
  assert.equal(readFileContext(blocked, 'key'), null);
  assert.doesNotThrow(() => writeFileContext(blocked, 'key', {}));
  const value = normalizeFileContext({
    fileQ: 'x'.repeat(2000),
    page: Infinity,
    scroll: -4,
    fileFolderOffset: 5000000,
    fileRecursive: 'true',
    anchor: { id: 'id', offset: 5000 },
  });
  assert.equal(value.fileQ.length, 500);
  assert.equal(value.page, 0);
  assert.equal(value.scroll, 0);
  assert.equal(value.fileFolderOffset, 1000000);
  assert.equal(value.anchor.offset, 1000);
  assert.equal(value.fileRecursive, false);
});
