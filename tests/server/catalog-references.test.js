import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogReferences, readCatalogReferences, validateCatalogReferences } from '../../src/server/storage/catalog-references.js';
import { writeCatalogShards } from '../../src/server/storage/file-catalog-shards.js';

test('physical reference counts retain aliases and unknown sizes independently from logical identities', async () => {
  const files = [
    { id: 'a', storageFileId: 'physical', storageName: 'a', bytes: 4 },
    { id: 'b', storageFileId: 'physical', storageName: 'a', bytes: 4 },
    { id: 'c', storageName: 'legacy' },
    { id: 'd' },
  ];
  assert.deepEqual(catalogReferences(files), {
    version: 1,
    entries: [
      ['id:physical', 2],
      ['name:legacy', 1],
    ],
  });
  let id = 0;
  const root = await writeCatalogShards({ revision: 4, files, _fileRegistry: { 'id:physical': { bytes: 4 } } }, null, async () => `part-${++id}`);
  assert.deepEqual(
    [...readCatalogReferences(root)],
    [
      ['id:physical', 2],
      ['name:legacy', 1],
    ],
  );
  root._fileCatalog.physicalReferences.entries[0][1]++;
  assert.throws(() => readCatalogReferences(root), { code: 'FILE_CATALOG_CORRUPT' });
});

test('missing reference indexes retain fallback; malformed counts, keys, duplicate identities and registry conflicts fail closed', () => {
  assert.equal(validateCatalogReferences(undefined), null);
  for (const entries of [
    [['id:x', 0]],
    [
      ['id:x', 1],
      ['id:x', 1],
    ],
    [['other', 1]],
    [['id:x', 100001]],
  ])
    assert.throws(() => validateCatalogReferences({ version: 1, entries }), { code: 'FILE_CATALOG_CORRUPT' });
});
