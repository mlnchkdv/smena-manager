import test from 'node:test';
import assert from 'node:assert/strict';
import { folderTrail, moveKnowledgeFolder, moveKnowledgeFolders } from '../../src/shared/knowledge-tools.js';
test('folder moves reject cycles and preserve siblings', () => {
  const folders = [
    { id: 'a', name: 'A' },
    { id: 'b', name: 'B', parentId: 'a' },
    { id: 'c', name: 'C' },
  ];
  assert.equal(moveKnowledgeFolder(folders, 'a', 'b'), false);
  assert.equal(moveKnowledgeFolder(folders, 'b', 'missing'), false);
  assert.equal(moveKnowledgeFolder(folders, 'b', 'c'), true);
  assert.deepEqual(
    folderTrail('b', folders).map(f => f.id),
    ['c', 'b'],
  );
});
test('bulk folder moves preserve selected subtrees and fail atomically on name collisions', () => {
  const folders = [
    { id: 'a', name: 'A' },
    { id: 'child', name: 'Child', parentId: 'a' },
    { id: 'b', name: 'B' },
    { id: 'target', name: 'Target' },
    { id: 'duplicate', name: 'A', parentId: 'target' },
  ];
  const before = structuredClone(folders);
  assert.equal(moveKnowledgeFolders(folders, ['a', 'b'], 'target'), false);
  assert.deepEqual(folders, before);
  assert.equal(moveKnowledgeFolders(folders, ['a', 'child'], 'b'), true);
  assert.equal(folders[1].parentId, 'a');
});
