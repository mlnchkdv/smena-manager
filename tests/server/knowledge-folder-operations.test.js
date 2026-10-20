import test from 'node:test';
import assert from 'node:assert/strict';
import { renameKnowledgeFolder, deleteKnowledgeFolder } from '../../src/shared/knowledge-folder-operations.js';

test('rename resolves the current collection and rejects sibling collisions', () => {
  const folders = [
    { id: 'a', name: 'A' },
    { id: 'b', name: 'B' },
  ];
  const refreshed = structuredClone(folders);
  assert.equal(renameKnowledgeFolder(refreshed, 'a', 'Renamed').ok, true);
  assert.equal(folders[0].name, 'A');
  assert.equal(refreshed[0].name, 'Renamed');
  assert.equal(renameKnowledgeFolder(refreshed, 'b', ' RENAMED ').reason, 'collision');
  assert.equal(renameKnowledgeFolder(refreshed, 'removed', 'New').ok, false);
});
test('folder deletion uses latest notes and children without replacing unrelated records', () => {
  const doc = {
    knowledgeFolders: [
      { id: 'parent', name: 'Parent' },
      { id: 'remove', name: 'Remove', parentId: 'parent' },
      { id: 'child', name: 'Child', parentId: 'remove' },
    ],
    knowledgeNotes: [
      { id: 'new-note', folderId: 'remove', formatted_markdown: 'latest content' },
      { id: 'other', folderId: 'child' },
    ],
  };
  assert.deepEqual(deleteKnowledgeFolder(doc, 'remove', 'me', 'now'), { ok: true, parentId: 'parent' });
  assert.equal(doc.knowledgeFolders.length, 2);
  assert.equal(doc.knowledgeFolders[1].parentId, 'parent');
  assert.deepEqual(doc.knowledgeNotes[0], { id: 'new-note', folderId: 'parent', formatted_markdown: 'latest content', updatedAt: 'now', updatedBy: 'me' });
  assert.deepEqual(doc.knowledgeNotes[1], { id: 'other', folderId: 'child' });
});
test('folder deletion rejects name collisions and stale IDs without partial mutation', () => {
  const doc = {
    knowledgeFolders: [
      { id: 'remove', name: 'Remove' },
      { id: 'a', name: 'Same' },
      { id: 'b', name: 'SAME', parentId: 'remove' },
    ],
    knowledgeNotes: [{ id: 'n', folderId: 'remove' }],
  };
  const before = structuredClone(doc);
  assert.equal(deleteKnowledgeFolder(doc, 'remove', 'me').reason, 'collision');
  assert.deepEqual(doc, before);
  assert.equal(deleteKnowledgeFolder(doc, 'removed', 'me').reason, 'missing');
  assert.deepEqual(doc, before);
});
