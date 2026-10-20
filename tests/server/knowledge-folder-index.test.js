import test from 'node:test';
import assert from 'node:assert/strict';
import { createKnowledgeFolderIndex, knowledgeFolderRows } from '../../src/shared/knowledge-folder-index.js';
test('large deep folder trees are counted and paginated without recursion', t => {
  const folders = Array.from({ length: 10000 }, (_, i) => ({ id: `f${i}`, name: `Folder ${i}`, parentId: i ? `f${i - 1}` : null }));
  const notes = folders.map(folder => ({ folderId: folder.id }));
  const started = performance.now();
  const index = createKnowledgeFolderIndex(folders, notes);
  assert.equal(index.counts.get('f0'), 10000);
  assert.equal(index.counts.get('f9999'), 1);
  assert.equal(knowledgeFolderRows(index).rows.length, 200);
  const last = knowledgeFolderRows(index, { revealId: 'f9999' });
  assert.equal(last.start, 9800);
  assert.equal(last.rows.at(-1).folder.id, 'f9999');
  assert.equal(knowledgeFolderRows(index, { collapsed: { f0: true } }).total, 1);
  t.diagnostic(`10,000 nested folders + notes: ${Math.round(performance.now() - started)} ms`);
});
test('filter reveals matching descendants and keeps their parent context', () => {
  const index = createKnowledgeFolderIndex([
    { id: 'p', name: 'Parent' },
    { id: 'a', name: 'Guide', parentId: 'p' },
    { id: 'b', name: 'Other', parentId: 'p' },
  ]);
  assert.deepEqual(
    knowledgeFolderRows(index, { query: 'GUIDE', collapsed: { p: true } }).rows.map(row => row.folder.id),
    ['p', 'a'],
  );
});
test('cycles and orphan folders remain reachable without mutating original parents', () => {
  const folders = [
    { id: 'a', name: 'A', parentId: 'b' },
    { id: 'b', name: 'B', parentId: 'a' },
    { id: 'orphan', name: 'Orphan', parentId: 'missing' },
  ];
  const index = createKnowledgeFolderIndex(folders, [{ folderId: 'b' }]);
  assert.equal(index.order.length, 3);
  assert.equal(new Set(index.order).size, 3);
  assert.equal(folders[0].parentId, 'b');
  assert.equal(index.counts.get('a'), 1);
});
