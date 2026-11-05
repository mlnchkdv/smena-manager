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

test('reference and localized type sorting follows displayed labels, not identities, with stable paging', () => {
  const types = [
    {
      id: 'z',
      name: 'Alpha',
      ru: 'Я',
      fields: [
        { id: 'owner', kind: 'member' },
        { id: 'project', kind: 'project' },
      ],
    },
    { id: 'a', name: 'Zulu', ru: 'А', fields: [] },
  ];
  const notes = [
    { id: 'z', title: 'Same', typeId: 'z', properties: { owner: 'z-id', project: 'z-id' } },
    { id: 'a', title: 'Same', typeId: 'z', properties: { owner: 'a-id', project: 'a-id' } },
    { id: 'hidden', title: 'Hidden', typeId: 'z', properties: { owner: 'private', project: 'private' } },
    { id: 'type-a', title: 'Other', typeId: 'a' },
  ];
  const context = {
    locale: 'en-US',
    types,
    members: [
      { id: 'z-id', name: 'Alex' },
      { id: 'a-id', name: 'Zoe' },
    ],
    projects: [
      { id: 'z-id', name: 'Project 2' },
      { id: 'a-id', name: 'Project 10' },
    ],
  };
  const result = key => knowledgeView(notes, { propertySort: { key }, columnContext: context }).filtered.map(n => n.id);
  assert.deepEqual(result('property:z:owner').slice(0, 2), ['z', 'a']);
  assert.deepEqual(result('property:z:project').slice(0, 2), ['z', 'a']);
  assert.equal(result('type').at(-1), 'type-a');
  assert.equal(knowledgeView(notes, { propertySort: { key: 'type' }, columnContext: { ...context, locale: 'ru-RU' } }).filtered[0].id, 'type-a');
  assert.deepEqual(
    knowledgeView(
      [
        { id: 'z', title: 'Same' },
        { id: 'a', title: 'Same' },
      ],
      { propertySort: { key: 'title' } },
    ).filtered.map(n => n.id),
    ['a', 'z'],
  );
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
