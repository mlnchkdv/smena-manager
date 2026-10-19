import assert from 'node:assert/strict';
import test from 'node:test';
import { knowledgeView } from '../../src/shared/knowledge-view.js';

const notes = [
  { id: 'a', title: 'Review', folderId: 'work', updatedAt: '2026-10-18' },
  { id: 'b', title: 'Регламент', summary: 'Команда', tags: ['процесс'], updatedAt: '2026-10-17' },
];

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
  const many = Array.from({ length: 240 }, (_, index) => ({ id: `n${index}`, title: `Note ${String(index).padStart(3, '0')}`, updatedAt: `2026-10-${String((index % 9) + 1).padStart(2, '0')}` }));
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
  assert.deepEqual(result.filtered.map(note => note.id), ['b', 'a']);
});
