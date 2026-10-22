import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createFileIndex, filterIndexedFiles } from '../../src/shared/file-index.js';

test('direct and recursive folder results are explicit and cannot leak other projects', () => {
  const project = {
    id: 'p',
    name: 'P',
    fileFolders: [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B', parentId: 'a' },
    ],
  };
  const index = createFileIndex(
    {
      files: [
        { id: 'one', name: 'one', project: 'p', folderId: 'a' },
        { id: 'two', name: 'two', project: 'p', folderId: 'b' },
        { id: 'hidden', name: 'hidden', project: 'other', folderId: 'a' },
      ],
    },
    [project],
  );
  assert.equal(filterIndexedFiles(index, { project: 'p', folder: 'a' }).length, 1);
  assert.equal(filterIndexedFiles(index, { project: 'p', folder: 'a', recursive: true }).length, 2);
});

test('file index scopes projects, resolves paths, counts direct children and tokenizes multilingual queries', () => {
  const project = {
    id: 'p',
    name: 'Съёмка',
    fileFolders: [
      { id: 'a', name: 'Материалы' },
      { id: 'b', name: 'Вложенные', parentId: 'a' },
    ],
  };
  const files = [
    { id: '1', name: 'Документ.txt', project: 'p', folderId: 'b', type: 'doc', by: 'm', task: 't' },
    { id: 'private', name: 'Hidden', project: 'private' },
  ];
  const index = createFileIndex({ files, members: [{ id: 'm', name: 'Dmitriy' }], tasks: [{ id: 't', title: 'Подготовка', key: 'PRJ-8' }] }, [project], {
    doc: 'Document Документ',
  });
  assert.deepEqual(
    index.files.map(file => file.id),
    ['1'],
  );
  assert.deepEqual(
    index.folderPath('p', 'b').map(folder => folder.id),
    ['a', 'b'],
  );
  assert.equal(index.count('p', 'b'), 1);
  assert.equal(index.hasChildren('p', 'a'), true);
  assert.equal(filterIndexedFiles(index, { query: 'съемка Dmitriy PRJ-8 document' }).length, 1);
  assert.equal(filterIndexedFiles(index, { folder: 'a' }).length, 0);
});

test('10,000 files and 2,000 folders stay indexed and pagination-ready without repeated entity scans', t => {
  const project = {
    id: 'p',
    name: 'Scale',
    fileFolders: Array.from({ length: 2000 }, (_, i) => ({ id: `folder-${i}`, name: `Папка ${i}`, parentId: i % 2 ? `folder-${i - 1}` : null })),
  };
  const data = {
    files: Array.from({ length: 10000 }, (_, i) => ({
      id: `f${i}`,
      name: `Заметки ${i}.txt`,
      project: 'p',
      folderId: `folder-${i % 2000}`,
      type: 'doc',
      bytes: 10,
      at: i,
    })),
  };
  const start = performance.now();
  const index = createFileIndex(data, [project]);
  const found = filterIndexedFiles(index, { query: 'Папка 1999', sort: 'name' });
  assert.equal(index.folderEntries.length, 2000);
  assert.equal(index.files.length, 10000);
  assert.equal(found.length, 5);
  assert.equal(index.totalBytes, 100000);
  t.diagnostic(`10k files + 2k folders indexed/searched in ${(performance.now() - start).toFixed(1)} ms`);
});
