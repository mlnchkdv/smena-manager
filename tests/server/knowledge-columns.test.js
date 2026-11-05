import test from 'node:test';
import assert from 'node:assert/strict';
import { knowledgeView } from '../../src/shared/knowledge-view.js';
test('property sorting applies to the whole collection before paging; missing values remain last', () => {
  const notes = Array.from({ length: 100 }, (_, i) => ({ id: String(i), title: String(i), typeId: 'custom', properties: { score: 100 - i } }));
  notes.push({ id: 'missing', title: 'A' });
  const result = knowledgeView(notes, { propertySort: { key: 'property:custom:score' }, limit: 20 });
  assert.equal(result.visible[0].id, '99');
  assert.equal(result.visible.length, 20);
  assert.equal(result.filtered.at(-1).id, 'missing');
  assert.equal(knowledgeView(notes, { propertySort: { key: 'property:custom:score', desc: true }, limit: 20 }).visible[0].id, '0');
});
