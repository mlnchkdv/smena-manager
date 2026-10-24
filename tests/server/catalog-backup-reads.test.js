import test from 'node:test';
import assert from 'node:assert/strict';
import { GoogleDriveStorageProvider } from '../../src/server/storage/google-drive.js';
import { writeCatalogShards } from '../../src/server/storage/file-catalog-shards.js';
import { rememberStorageVersion, storageVersion } from '../../src/server/storage/version-token.js';

async function fixture() {
  const parts = new Map();
  const root = await writeCatalogShards(
    { schemaVersion: 3, revision: 7, files: [{ id: 'f', project: 'p', name: 'Файл.txt', history: ['complete'] }] },
    null,
    async text => {
      const id = `part-${parts.size}`;
      parts.set(id, text);
      return id;
    },
  );
  const provider = new GoogleDriveStorageProvider();
  const reads = { root: 0, part: 0 };
  let etag = 'exact-root';
  provider.readDatabaseRoot = async () => {
    reads.root++;
    return rememberStorageVersion(structuredClone(root), etag);
  };
  provider.readCatalogPart = async id => {
    reads.part++;
    return parts.get(id);
  };
  return { provider, root, reads, parts, etag: value => (etag = value) };
}

test('backup reuse requires a fresh exact root ETag and still validates the manifest', async () => {
  const f = await fixture();
  assert.deepEqual(await f.provider.loadDatabaseForBackup('exact-root'), { unchanged: true });
  assert.deepEqual(f.reads, { root: 1, part: 0 });
  f.root._fileCatalog.total++;
  await assert.rejects(f.provider.loadDatabaseForBackup('exact-root'), { code: 'FILE_CATALOG_CORRUPT' });
});

test('changed or missing root ETags materialize complete records, not identities or revision-only cache hits', async () => {
  const f = await fixture();
  for (const etag of ['different-same-revision', null]) {
    f.etag(etag);
    const loaded = await f.provider.loadDatabaseForBackup('exact-root');
    assert.equal(loaded.unchanged, false);
    assert.deepEqual(loaded.data.files[0].history, ['complete']);
    assert.equal(storageVersion(loaded.data), etag);
  }
  assert.deepEqual(f.reads, { root: 2, part: 2 });
});

test('cold backup reads reject a corrupt part rather than publishing an incomplete recovery point', async () => {
  const f = await fixture();
  const id = f.root._fileCatalog.shards[0].id;
  f.parts.set(id, '[]');
  await assert.rejects(f.provider.loadDatabaseForBackup(null), { code: 'FILE_CATALOG_CORRUPT' });
});
