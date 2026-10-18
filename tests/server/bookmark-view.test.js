import assert from 'node:assert/strict';
import test from 'node:test';
import { savedBookmarkView } from '../../src/shared/bookmark-view.js';

test('saved bookmarks remain visible after renaming and moving to another folder', () => {
  assert.deepEqual(savedBookmarkView({ folder: 'new' }, 'old'), { bookmarkQuery: '', bookmarkScope: 'active', bookmarkFolder: 'new' });
  assert.equal(savedBookmarkView({ folder: '' }, 'old').bookmarkFolder, 'root');
  assert.equal(savedBookmarkView({ folder: 'new' }, 'all').bookmarkFolder, 'all');
  assert.equal(savedBookmarkView({ folder: '' }, 'root').bookmarkFolder, 'root');
});

test('editing an archived bookmark keeps the archived list selected', () => {
  assert.deepEqual(savedBookmarkView({ folder: 'docs', is_archived: true }, 'docs'), {
    bookmarkQuery: '',
    bookmarkScope: 'archived',
    bookmarkFolder: 'docs',
  });
});
