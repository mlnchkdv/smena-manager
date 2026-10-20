import test from 'node:test';
import assert from 'node:assert/strict';
import { noteHistory, historyContent, knowledgeVersionFits } from '../../src/shared/knowledge-history.js';
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
test('large imported notes keep their content but do not create unbounded history snapshots', () => {
  const previous = { title: 'Large import', formatted_markdown: 'Я'.repeat(33000), history: [{ id: 'existing' }] };
  assert.equal(knowledgeVersionFits(previous), false);
  assert.equal(knowledgeVersionFits({ title: 'Small', formatted_markdown: 'Body' }), true);
  assert.deepEqual(noteHistory(previous, { ...previous, title: 'Edited large import' }), previous.history);
  assert.equal(previous.formatted_markdown.length, 33000);
});
test('autosaves preserve the beginning of an editing session while explicit restores preserve the current version', () => {
  const before = { title: 'Original', updatedBy: 'a' },
    edited = { title: 'Changed', updatedBy: 'a' };
  const history = noteHistory(before, edited);
  assert.equal(noteHistory({ ...edited, history }, { title: 'Changed again', updatedBy: 'a' }).length, 1);
  assert.equal(noteHistory({ ...edited, history }, { title: 'Original', updatedBy: 'a', restoreFromVersion: history[0].id }).length, 2);
});
