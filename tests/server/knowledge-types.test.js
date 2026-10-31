import test from 'node:test';
import assert from 'node:assert/strict';
import { noteType, validNoteTypes, validNoteProperties } from '../../src/shared/knowledge-types.js';
import { noteHistory, historyContent } from '../../src/shared/knowledge-history.js';
import { matchesKnowledgeSearch } from '../../src/shared/knowledge-search.js';

test('typed note metadata is bounded, portable and restored with content', () => {
  assert.equal(noteType({}).id, 'note');
  const custom = { id: 'spec', name: 'Specification', fields: [{ id: 'cost', name: 'Cost', kind: 'number' }] };
  assert.equal(validNoteTypes([custom]), true);
  assert.equal(validNoteTypes([custom, custom]), false);
  assert.equal(validNoteTypes([null]), false);
  assert.equal(validNoteTypes([{ ...custom, id: 'note' }]), false);
  assert.equal(validNoteProperties({ typeId: 'spec', properties: { cost: 40, approved: false } }), true);
  assert.equal(validNoteProperties({ properties: { nested: { executable: true } } }), false);
  const before = { id: 'a', title: 'Spec', typeId: 'spec', properties: { cost: 40, code: 'КЛАСТЕР' } };
  assert.equal(matchesKnowledgeSearch(before, 'кластер'), true);
  const history = noteHistory(before, { ...before, properties: { cost: 55 } });
  assert.deepEqual(historyContent(history[0], []).properties, before.properties);
});
