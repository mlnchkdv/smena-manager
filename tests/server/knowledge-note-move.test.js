import test from 'node:test';
import assert from 'node:assert/strict';
import { moveKnowledgeNotes } from '../../src/shared/knowledge-note-move.js';

test('note moves reject stale destinations and missing notes atomically', () => {
  const notes = [
    { id: 'a', folderId: null },
    { id: 'b', folderId: 'from' },
  ];
  const before = structuredClone(notes);
  assert.equal(moveKnowledgeNotes(notes, [], ['a'], 'removed', 'me').ok, false);
  assert.equal(moveKnowledgeNotes(notes, [], ['a', 'removed'], null, 'me').ok, false);
  assert.deepEqual(notes, before);
});
test('note moves preserve content, skip unchanged notes and timestamp only changed notes', () => {
  const notes = [
    { id: 'a', folderId: null, formatted_markdown: '# Text', history: [{ id: 'v' }] },
    { id: 'b', folderId: 'to', updatedAt: 'old' },
  ];
  assert.deepEqual(moveKnowledgeNotes(notes, [{ id: 'to' }], ['a', 'a', 'b'], 'to', 'me', 'now'), { ok: true, moved: 1 });
  assert.equal(notes[0].updatedAt, 'now');
  assert.equal(notes[0].updatedBy, 'me');
  assert.equal(notes[0].formatted_markdown, '# Text');
  assert.deepEqual(notes[0].history, [{ id: 'v' }]);
  assert.equal(notes[1].updatedAt, 'old');
  assert.equal(moveKnowledgeNotes(notes, [], ['a'], null, 'me').moved, 1);
  assert.equal(notes[0].folderId, null);
});
