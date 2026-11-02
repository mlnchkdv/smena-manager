import test from 'node:test';
import assert from 'node:assert/strict';
import { inboxConversation } from '../../src/shared/inbox-conversation.js';
const comments = Array.from({ length: 12 }, (_, i) => ({ id: 'c-' + i }));
test('old selected message has a bounded exact context with paging', () => {
  const n = { id: 'n-42-mention-c-1-u-a', type: 'mention', recipient: 'u-a' };
  const v = inboxConversation(comments, n);
  assert.equal(v.target, 'c-1');
  assert.deepEqual(
    v.items.map(c => c.id),
    ['c-0', 'c-1', 'c-2', 'c-3'],
  );
  const next = inboxConversation(comments, n, { id: n.id, start: v.start, end: v.end + 8 });
  assert.equal(next.end, 12);
});
test('missing or legacy messages never match similar text and state is notification scoped', () => {
  assert.equal(inboxConversation(comments, { id: 'old', snippet: 'c-1' }).target, null);
  assert.equal(inboxConversation(comments, { id: 'gone', comment: 'deleted' }).missing, true);
  assert.equal(inboxConversation(comments, { id: 'other', comment: 'c-10' }, { id: 'old', start: 0, end: 4 }).target, 'c-10');
  assert.equal(inboxConversation([], { id: 'n', comment: 'private' }).items.length, 0);
});
