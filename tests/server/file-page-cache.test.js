import test from 'node:test';
import assert from 'node:assert/strict';
import { filePageOptions, createFolderCountCache } from '../../src/shared/file-page-cache.js';

test('viewport folder windows do not invalidate file rows, while actual filters do', () => {
  const query = { project: 'p', context: 'all', query: 'photo', limit: 100, offset: 0, countFolders: [['p', 'a']] };
  const identity = options => JSON.stringify(filePageOptions(options));
  assert.equal(identity(query), identity({ countFolders: [['p', 'b']], ...filePageOptions(query) }));
  for (const change of [
    { query: 'video' },
    { project: 'private' },
    { offset: 100 },
    { limit: 25 },
    { context: 'project' },
    { folder: 'folder' },
    { recursive: true },
    { sort: 'name' },
  ])
    assert.notEqual(identity(query), identity({ ...query, ...change }));
});

test('bounded folder counts are scoped, deduplicated and copied, including zero counts', () => {
  const cache = createFolderCountCache(2),
    keys = [
      ['p', 'a'],
      ['p', 'b'],
    ];
  cache.seed('session/role/workspace/revision1', [
    ['p', 'a', 0],
    ['p', 'b', 5],
    ['p', 'bad', '<script>'],
  ]);
  assert.deepEqual(cache.missing('session/role/workspace/revision1', [...keys, keys[0]]), []);
  const read = cache.read('session/role/workspace/revision1', keys);
  read[0][2] = 999;
  assert.equal(cache.read('session/role/workspace/revision1', keys)[0][2], 0);
  cache.seed('session/role/workspace/revision1', [['p', 'c', 2]]);
  assert.deepEqual(cache.missing('session/role/workspace/revision1', keys), [['p', 'a']]);
  assert.deepEqual(cache.read('session/otherRole/workspace/revision1', keys), []);
  cache.seed('session/otherRole/workspace/revision1', [['p', 'a', 10]]);
  assert.deepEqual(cache.read('session/otherRole/workspace/revision2', keys), []);
  cache.seed('new-session/otherRole/workspace/revision2', [['p', 'a', 4]]);
  cache.clear();
  assert.deepEqual(cache.read('new-session/otherRole/workspace/revision2', keys), []);
});
