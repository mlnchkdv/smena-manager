import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPortableWorkspace, mergePortableWorkspace } from '../../src/shared/portable-workspace.js';
test('portable knowledge retains definitions and remaps stable note references on conflicts', () => {
  const source = {
    ws: { knowledgeTypes: [{ id: 'custom', name: 'Custom', fields: [] }] },
    knowledgeNotes: [
      { id: 'a', title: 'A', typeId: 'custom', formatted_markdown: 'Hello' },
      { id: 'b', title: 'B', formatted_markdown: '[[note:a#^block|A]]' },
    ],
  };
  const payload = buildPortableWorkspace(source);
  assert.equal(payload.knowledgeTypes.length, 1);
  const target = { ws: {}, knowledgeNotes: [{ id: 'a', title: 'A', formatted_markdown: 'Different' }] };
  let n = 0;
  const result = mergePortableWorkspace(target, payload, { includeDefinitions: true, idFactory: () => `new${++n}` });
  const copied = result.data.knowledgeNotes.find(note => note.title === 'A (2)');
  assert.ok(copied);
  assert.match(result.data.knowledgeNotes.find(note => note.id === 'b').formatted_markdown, new RegExp(`note:${copied.id}#\\^block`));
  assert.equal(result.data.ws.knowledgeTypes[0].id, 'custom');
  const without = mergePortableWorkspace(target, payload);
  assert.equal(without.data.ws.knowledgeTypes, undefined);
});
