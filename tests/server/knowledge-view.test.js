import assert from 'node:assert/strict';
import test from 'node:test';
import { knowledgeFolderOverlay } from '../../src/shared/knowledge-layout.js';

test('knowledge folder overlay follows usable width and sidebar collapse without changing the view', () => {
  assert.equal(knowledgeFolderOverlay(1440), false);
  assert.equal(knowledgeFolderOverlay(1024), true);
  assert.equal(knowledgeFolderOverlay(1024, true), false);
  assert.equal(knowledgeFolderOverlay(900, true), true);
  assert.equal(knowledgeFolderOverlay(320), true);
  assert.equal(knowledgeFolderOverlay(1440, false, 468), true);
  assert.equal(knowledgeFolderOverlay(1440, true, 1188), false);
});
import { knowledgeView } from '../../src/shared/knowledge-view.js';

const notes = [
  { id: 'a', title: 'Review', folderId: 'work', updatedAt: '2026-10-18' },
  { id: 'b', title: 'Регламент', summary: 'Команда', tags: ['процесс'], updatedAt: '2026-10-17' },
];
test('parent folder includes descendants consistently with navigation counts', () => {
  const folders = [{ id: 'parent' }, { id: 'child', parentId: 'parent' }];
  const notes = [
    { id: 'a', folderId: 'child' },
    { id: 'b', folderId: 'other' },
  ];
  assert.deepEqual(
    knowledgeView(notes, { folder: 'parent', folders }).visible.map(note => note.id),
    ['a'],
  );
});
test('search composes words in any order and quoted phrases', () => {
  assert.equal(knowledgeView([{ id: 'a', title: 'Команда', formatted_markdown: 'Новый процесс работы' }], { query: 'процесс команда' }).total, 1);
  assert.equal(knowledgeView([{ id: 'a', title: 'Team', formatted_markdown: 'new work process' }], { query: '"work process" team' }).total, 1);
  assert.equal(knowledgeView([{ id: 'a', title: 'Team', formatted_markdown: 'work new process' }], { query: '"work process"' }).total, 0);
});

test('bounded pages reach notes beyond the old 1000-item ceiling', () => {
  const many = Array.from({ length: 1400 }, (_, i) => ({ id: String(i), title: String(i) }));
  const page = knowledgeView(many, { limit: 60, offset: 1380 });
  assert.equal(page.visible.length, 20);
  assert.equal(page.start, 1380);
  assert.equal(page.hasMore, false);
  assert.equal(knowledgeView(many, { limit: 60, offset: 99999 }).start, 1380);
});

test('knowledge search and folder filters cannot leave an excluded note in the editor', () => {
  assert.equal(knowledgeView(notes, { query: ' ПРОЦЕСС ', activeId: 'a' }).active.id, 'b');
  assert.equal(knowledgeView(notes, { folder: 'root', activeId: 'a' }).active.id, 'b');
  assert.equal(knowledgeView(notes, { folder: 'missing', activeId: 'a' }).active, null);
  assert.equal(knowledgeView(notes, { query: 'absent', activeId: 'a' }).filtered.length, 0);
});

test('knowledge selection preserves a matching note and sorting does not mutate source data', () => {
  assert.equal(knowledgeView(notes, { activeId: 'b' }).active.id, 'b');
  const input = [{ id: 'invalid', updatedAt: 'bad' }, { id: 'favorite', favorite: true }, ...notes];
  const result = knowledgeView(input);
  assert.deepEqual(
    result.filtered.map(note => note.id),
    ['favorite', 'a', 'b', 'invalid'],
  );
  assert.equal(input[0].id, 'invalid');
});

test('knowledge view limits large lists without losing the active note', () => {
  const many = Array.from({ length: 240 }, (_, index) => ({
    id: `n${index}`,
    title: `Note ${String(index).padStart(3, '0')}`,
    updatedAt: `2026-10-${String((index % 9) + 1).padStart(2, '0')}`,
  }));
  const result = knowledgeView(many, { limit: 20, activeId: 'n239' });
  assert.equal(result.total, 240);
  assert.equal(result.hasMore, true);
  assert.equal(result.visible.length, 21);
  assert.equal(result.active.id, 'n239');
  assert.ok(result.visible.some(note => note.id === 'n239'));
});

test('favorites and title sorting compose with search filters', () => {
  const result = knowledgeView(
    [
      { id: 'a', title: 'Zeta', favorite: true, updatedAt: '2026-10-18' },
      { id: 'b', title: 'Alpha', favorite: true, updatedAt: '2026-10-17' },
      { id: 'c', title: 'Alpha', favorite: false, updatedAt: '2026-10-19' },
    ],
    { folder: 'favorites', sort: 'title' },
  );
  assert.deepEqual(
    result.filtered.map(note => note.id),
    ['b', 'a'],
  );
});
