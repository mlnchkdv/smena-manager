import test from 'node:test';
import assert from 'node:assert/strict';
import { knowledgeView } from '../../src/shared/knowledge-view.js';
import { normalizeKnowledgeColumnSort } from '../../src/shared/knowledge-columns.js';
test('property sorting applies to the whole collection before paging; missing values remain last', () => {
  const notes = Array.from({ length: 100 }, (_, i) => ({ id: String(i), title: String(i), typeId: 'custom', properties: { score: 100 - i } }));
  notes.push({ id: 'missing', title: 'A' });
  const result = knowledgeView(notes, { propertySort: { key: 'property:custom:score' }, limit: 20 });
  assert.equal(result.visible[0].id, '99');
  assert.equal(result.visible.length, 20);
  assert.equal(result.filtered.at(-1).id, 'missing');
  assert.equal(knowledgeView(notes, { propertySort: { key: 'property:custom:score', desc: true }, limit: 20 }).visible[0].id, '0');
});

test('removing a sorted column resets both the selected key and actual collection order', () => {
  const notes = [
    { id: 'a', title: 'A', updatedAt: '2026-11-05' },
    { id: 'z', title: 'Z', updatedAt: '2026-01-01' },
  ];
  const old = { key: 'updated', desc: true };
  assert.deepEqual(normalizeKnowledgeColumnSort(old, ['updated']), old);
  const sort = normalizeKnowledgeColumnSort(old, ['type', 'tags']);
  assert.deepEqual(sort, { key: 'title', desc: false });
  assert.deepEqual(
    knowledgeView(notes, { propertySort: sort }).visible.map(note => note.id),
    ['a', 'z'],
  );
  assert.deepEqual(normalizeKnowledgeColumnSort({ key: 'property:deleted:field', desc: true }, []), sort);
});
