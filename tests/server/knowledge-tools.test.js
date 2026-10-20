import test from 'node:test';
import assert from 'node:assert/strict';
import { folderTrail, moveKnowledgeFolder } from '../../src/shared/knowledge-tools.js';
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
