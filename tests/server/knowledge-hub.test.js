import test from 'node:test';
import assert from 'node:assert/strict';
import { hubNotes } from '../../src/shared/knowledge-hub.js';
test('hubs resolve typed identities and material links without duplicating notes', () => {
  const data = {
    ws: {},
    knowledgeNotes: [
      { id: 'a', typeId: 'meeting', properties: { project: 'p' } },
      { id: 'b', typeId: 'instruction', properties: { owner: 'm' } },
      { id: 'c', formatted_markdown: '[[project:p|Project]]' },
      { id: 'd', properties: { random: 'p' } },
    ],
  };
  assert.deepEqual(
    hubNotes(data, 'project', 'p').map(n => n.id),
    ['a', 'c'],
  );
  assert.deepEqual(
    hubNotes(data, 'member', 'm').map(n => n.id),
    ['b'],
  );
  assert.deepEqual(
    hubNotes(data, 'project', 'private').map(n => n.id),
    [],
  );
});
