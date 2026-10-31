import test from 'node:test';
import assert from 'node:assert/strict';
import { unlinkedMentions } from '../../src/shared/knowledge-context.js';
test('context suggestions are bounded and exclude self, linked notes and code', () => {
  const active = { id: 'a', title: 'Process' };
  const notes = [
    active,
    { id: 'b', title: 'B', formatted_markdown: 'Review PROCESS tomorrow' },
    { id: 'c', formatted_markdown: '```Process```' },
    { id: 'd', formatted_markdown: '[[Process]]' },
  ];
  assert.deepEqual(
    unlinkedMentions(notes, active).map(n => n.id),
    ['b'],
  );
  assert.deepEqual(unlinkedMentions(notes, active, ['b']), []);
  assert.match(unlinkedMentions(notes, active)[0].snippet, /PROCESS/);
});
