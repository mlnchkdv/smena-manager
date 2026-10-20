import test from 'node:test';
import assert from 'node:assert/strict';
import { noteHistory, historyContent } from '../../src/shared/knowledge-history.js';
test('authoritative history ignores client snapshots, bounds versions and restores missing folders safely', () => {
  const previous = { title: 'Old', formatted_markdown: 'Body', folderId: 'deleted', updatedAt: '2026-10-20' };
  const next = { title: 'New', formatted_markdown: 'Body', history: [{ id: 'forged' }] };
  const history = noteHistory(previous, next);
  assert.equal(history[0].title, 'Old');
  assert.equal(history.length, 1);
  assert.equal(historyContent(history[0], []).folderId, null);
  assert.equal(noteHistory(undefined, next).length, 0);
  assert.equal(noteHistory({ ...previous, history: Array.from({ length: 10 }, (_, i) => ({ id: String(i) })) }, next).length, 5);
});
