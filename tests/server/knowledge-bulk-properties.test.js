import test from 'node:test';
import assert from 'node:assert/strict';
import { bulkNoteProperties } from '../../src/shared/knowledge-bulk-properties.js';
test('bulk note changes preserve unknown properties and fail atomically for mismatched fields', () => {
  const notes = [
    { id: 'a', typeId: 'note', tags: ['Old'], properties: { hidden: 'keep' } },
    { id: 'b', typeId: 'note', tags: [], properties: {} },
  ];
  const next = bulkNoteProperties(
    notes,
    ['a', 'b'],
    { typeId: 'meeting', addTags: 'Team, team', removeTags: 'old', property: 'date', value: '2026-11-05' },
    {},
  );
  assert.equal(next[0].properties.hidden, 'keep');
  assert.equal(next[1].typeId, 'meeting');
  assert.deepEqual(next[0].tags, ['Team']);
  assert.deepEqual(notes[0].tags, ['Old']);
  assert.throws(() => bulkNoteProperties(notes, ['a', 'b'], { property: 'date', value: 'bad' }, {}));
  assert.throws(() => bulkNoteProperties(notes, ['missing'], {}, {}));
  assert.throws(() => bulkNoteProperties(notes, ['a', 'a'], {}, {}));
});
