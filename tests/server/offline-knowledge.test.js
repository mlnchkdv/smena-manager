import test from 'node:test';
import assert from 'node:assert/strict';
import { offlineEditPlan } from '../../src/shared/offline-knowledge.js';
test('offline edits fence account workspace and original content', () => {
  const e = { id: 'n', owner: 'a', workspace: 'w', pending: true, base: { formatted_markdown: 'Original' }, body: 'Edited' };
  assert.equal(offlineEditPlan([e], { knowledgeNotes: [{ id: 'n', formatted_markdown: 'Original' }] }, 'a', 'w').ready.length, 1);
  assert.equal(offlineEditPlan([e], { knowledgeNotes: [{ id: 'n', formatted_markdown: 'Team edit' }] }, 'a', 'w').conflicts.length, 1);
  assert.equal(offlineEditPlan([e], { knowledgeNotes: [] }, 'other', 'w').conflicts.length, 0);
  assert.equal(offlineEditPlan([e], { knowledgeNotes: [] }, 'a', 'other').ready.length, 0);
});
