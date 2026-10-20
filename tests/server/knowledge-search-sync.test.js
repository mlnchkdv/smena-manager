import test from 'node:test';
import assert from 'node:assert/strict';
import { configureDocumentWorkspaceSync, workspaceDocumentSyncIsClean, disableWorkspaceSync } from '../../src/core/workspace-sync.js';
test('knowledge search rejects local changes before the save debounce queues them', () => {
  const original = { knowledgeNotes: [{ id: 'a', title: 'Imported', formatted_markdown: 'Body' }], knowledgeFolders: [] };
  configureDocumentWorkspaceSync('knowledge', 7, 'editor', original);
  try {
    assert.equal(workspaceDocumentSyncIsClean('knowledge', original), true);
    assert.equal(workspaceDocumentSyncIsClean('knowledge', { ...original, knowledgeNotes: [] }), false);
    assert.equal(workspaceDocumentSyncIsClean('knowledge', { ...original, knowledgeNotes: [{ ...original.knowledgeNotes[0], title: 'Renamed' }] }), false);
    assert.equal(workspaceDocumentSyncIsClean('knowledge', { ...original, tasks: [{ title: 'Unrelated task' }] }), true);
    assert.equal(workspaceDocumentSyncIsClean('unknown', original), false);
  } finally {
    disableWorkspaceSync();
  }
});
