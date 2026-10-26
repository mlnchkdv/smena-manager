import assert from 'node:assert/strict';
import test from 'node:test';
import { bookmarkView, savedBookmarkView } from '../../src/shared/bookmark-view.js';

test('saved bookmarks remain visible after editing archive state, folder and title', () => {
  assert.deepEqual(savedBookmarkView({ folder: 'new', is_archived: true }, 'old'), { bookmarkQuery: '', bookmarkScope: 'archived', bookmarkFolder: 'new' });
  assert.equal(savedBookmarkView({ folder: 'new' }, 'all').bookmarkFolder, 'all');
  assert.equal(savedBookmarkView({}, 'old').bookmarkFolder, 'root');
});
test('saved bookmarks remain visible after renaming and moving to another folder', () => {
  assert.deepEqual(savedBookmarkView({ folder: 'new' }, 'old'), { bookmarkQuery: '', bookmarkScope: 'active', bookmarkFolder: 'new' });
  assert.equal(savedBookmarkView({ folder: '' }, 'old').bookmarkFolder, 'root');
  assert.equal(savedBookmarkView({ folder: 'new' }, 'all').bookmarkFolder, 'all');
  assert.equal(savedBookmarkView({ folder: '' }, 'root').bookmarkFolder, 'root');
});
test('editing an archived bookmark keeps the archived list selected', () => {
  assert.deepEqual(savedBookmarkView({ folder: 'docs', is_archived: true }, 'docs'), { bookmarkQuery: '', bookmarkScope: 'archived', bookmarkFolder: 'docs' });
});

test('large bookmark collections have bounded pages without mutating source order', () => {
  const links = Array.from({ length: 1300 }, (_, i) => ({ id: String(i), title: 'Team guide', updated_at: new Date(i * 1000).toISOString() }));
  assert.equal(bookmarkView(links).items.length, 60);
  assert.equal(bookmarkView(links, { page: 99 }).items.length, 40);
  assert.equal(links[0].id, '0');
});
test('bookmark words, phrases, archive and folders compose consistently', () => {
  const links = [
    { id: 'a', title: 'Команда', description: 'new work process', folder: 'team' },
    { id: 'b', title: 'Команда', description: 'work new process', is_archived: true },
  ];
  assert.deepEqual(
    bookmarkView(links, { query: '"work process" команда', folder: 'team' }).items.map(x => x.id),
    ['a'],
  );
  assert.equal(bookmarkView(links, { query: '"work process"', scope: 'archived' }).total, 0);
});
