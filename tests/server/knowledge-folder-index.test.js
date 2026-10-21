import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createKnowledgeFolderIndex,
  knowledgeFolderRows,
  knowledgeFolderChildren,
  knowledgeFolderDestinations,
} from '../../src/shared/knowledge-folder-index.js';
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
test('right-hand folder browser paginates immediate children and counts descendant notes', () => {
  const folders = [
    { id: 'p', name: 'Parent' },
    ...Array.from({ length: 1000 }, (_, i) => ({ id: `c${i}`, name: `Chapter ${i}`, parentId: 'p' })),
    { id: 'deep', name: 'Nested', parentId: 'c0' },
  ];
  const index = createKnowledgeFolderIndex(folders, [{ folderId: 'deep' }]);
  assert.deepEqual(
    knowledgeFolderChildren(index, null).folders.map(folder => folder.id),
    ['p'],
  );
  const first = knowledgeFolderChildren(index, 'p');
  assert.equal(first.folders.length, 6);
  assert.equal(first.total, 1000);
  assert.equal(first.folders[0].id, 'c0');
  assert.equal(index.counts.get('c0'), 1);
  const last = knowledgeFolderChildren(index, 'p', { offset: 9999 });
  assert.equal(last.start, 996);
  assert.equal(last.folders.length, 4);
  assert.equal(last.hasMore, false);
  assert.equal(knowledgeFolderChildren(index, 'p', { query: 'CHAPTER 999' }).folders[0].id, 'c999');
  assert.equal(knowledgeFolderChildren(index, 'p', { query: 'Nested' }).total, 0);
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

test('folder search combines RU/EN words across ancestor paths and preserves exact phrases', () => {
  const index = createKnowledgeFolderIndex([
    { id: 'p', name: 'Раздел 049 / Team Docs' },
    { id: 'a', name: 'Подпапка 549 / Field Guide', parentId: 'p' },
    { id: 'b', name: 'Guide Field', parentId: 'p' },
  ]);
  assert.deepEqual(
    knowledgeFolderDestinations(index, null, { query: '549 Раздел 049' }).folders.map(f => f.id),
    ['a'],
  );
  assert.deepEqual(
    knowledgeFolderDestinations(index, null, { query: 'docs "field guide"' }).folders.map(f => f.id),
    ['a'],
  );
  assert.equal(knowledgeFolderDestinations(index, null, { query: '"Team Docs / Подпапка"' }).folders[0].id, 'a');
  assert.deepEqual(
    knowledgeFolderRows(index, { query: '549 раздел' }).rows.map(row => row.folder.id),
    ['p', 'a'],
  );
  assert.equal(knowledgeFolderChildren(index, 'p', { query: '549 Подпапка' }).folders[0].id, 'a');
});

test('deep path search stays iterative and destination results remain paginated', t => {
  const folders = Array.from({ length: 10000 }, (_, i) => ({ id: `f${i}`, name: i ? `Child ${i}` : 'Root', parentId: i ? `f${i - 1}` : null }));
  const index = createKnowledgeFolderIndex(folders);
  const started = performance.now();
  assert.equal(knowledgeFolderDestinations(index, null, { query: 'root "child 9999"' }).folders[0].id, 'f9999');
  const last = knowledgeFolderDestinations(index, null, { query: 'root', offset: 999999 });
  assert.equal(last.start, 9960);
  assert.equal(last.folders.length, 40);
  assert.equal(last.hasMore, false);
  t.diagnostic(`10,000 deep folder path search: ${Math.round(performance.now() - started)} ms`);
});
