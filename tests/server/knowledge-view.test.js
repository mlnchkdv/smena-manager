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
