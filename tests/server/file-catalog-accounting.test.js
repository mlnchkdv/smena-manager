import test from 'node:test';
import assert from 'node:assert/strict';
import { createCatalogAccounting, readCatalogAccounting } from '../../src/server/file-catalog-accounting.js';
import { fileStorageAccounting } from '../../src/server/file-capacity.js';
import { workspaceTransportBytes } from '../../src/shared/workspace-size.js';
import { writeCatalogShards, materializeCatalog } from '../../src/server/storage/file-catalog-shards.js';
import { GoogleDriveStorageProvider } from '../../src/server/storage/google-drive.js';
import { storageVersion } from '../../src/server/storage/version-token.js';

function fixture() {
  const file = { id: 'a', project: 'p', name: 'Инструкция.md', storageFileId: 'active', storageName: 'a', bytes: 12, history: [{ text: 'x'.repeat(200000) }] };
  return {
    schemaVersion: 3,
    revision: 9,
    _aggregateVersion: 1,
    files: [
      file,
      { ...file, id: 'alias' },
      { id: 'no-size', project: 'p', name: 'Без размера' },
      { id: 'null', project: 'p', name: 'Null', bytes: null },
      { id: 'zero', project: 'p', name: 'Empty', bytes: 0, storageName: 'empty' },
    ],
    trash: [{ data: { file: { storageFileId: 'retained' } } }],
    _fileGc: [{ storageFileId: 'retained' }, { storageName: 'unknown' }, { storageFileId: 'active' }],
    _fileRegistry: { 'id:active': { bytes: 12 }, 'id:retained': { bytes: 20 }, 'name:empty': { bytes: 0 } },
  };
}
async function stored(data = fixture()) {
  const parts = new Map();
  const write = async text => {
    const id = `part-${parts.size}`;
    parts.set(id, text);
    return id;
  };
  const root = await writeCatalogShards(data, null, write);
  const reads = [];
  const provider = new GoogleDriveStorageProvider();
  provider.initialized = true;
  provider.databaseFileId = 'db';
  provider.client = {
    files: {
      get: async ({ fileId }) => {
        reads.push(fileId);
        return { data: fileId === 'db' ? JSON.stringify(root) : parts.get(fileId), headers: { etag: `"${root.revision}"` } };
      },
    },
  };
  return { root, parts, write, reads, provider };
}

test('accounting matches complete UTF-8 catalog bytes, aliases, retained storage and unknown vs zero sizes', async () => {
  const data = fixture();
  const f = await stored(data);
  const value = readCatalogAccounting(f.root);
  assert.equal(value.catalogBytes, workspaceTransportBytes({ files: data.files }, 9));
  assert.deepEqual(value.fileStorage, fileStorageAccounting(data));
  assert.deepEqual(value.fileStorage.logical, { files: 5, knownBytes: 24, unknownFiles: 2 });
  assert.deepEqual(value.fileStorage.activePhysical, { files: 2, knownBytes: 12, unknownFiles: 0 });
  assert.deepEqual(value.fileStorage.retainedPhysical, { files: 2, knownBytes: 20, unknownFiles: 1 });
  assert.equal(value.fileStorage.aliases, 1);
  assert.equal(value.fileStorage.backupPhysicalBytes, null);
  assert.ok(Buffer.byteLength(JSON.stringify(f.root._fileCatalog.accounting)) < 1024);
  value.fileStorage.logical.files = 99;
  assert.equal(readCatalogAccounting(f.root).fileStorage.logical.files, 5, 'Consumers cannot mutate persisted summary objects');
});

test('cold detailed status reads root only, retaining version and canonical fallback for legacy layouts', async () => {
  const data = fixture(),
    f = await stored(data);
  const result = await f.provider.loadDatabaseStatus();
  assert.deepEqual(f.reads, ['db']);
  assert.equal(storageVersion(result.data), '"9"');
  assert.equal(result.data.files[0].storageFileId, undefined);
  assert.equal(result.accounting.fileStorage.logical.unknownFiles, 2);
  assert.deepEqual(result.catalog, { layout: 'project-shards', version: 3, parts: 1 });
  delete f.root._fileCatalog.accounting;
  f.reads.length = 0;
  const legacy = await f.provider.loadDatabaseStatus();
  assert.deepEqual(legacy.data, data);
  assert.equal(legacy.accounting, null);
  assert.deepEqual(f.reads, ['db', f.root._fileCatalog.shards[0].id]);
  f.root._fileCatalog = undefined;
  f.root.files = data.files;
  f.reads.length = 0;
  const aggregate = await f.provider.loadDatabaseStatus();
  assert.deepEqual(aggregate.data.files, data.files);
  assert.deepEqual(aggregate.catalog, { layout: 'aggregate', version: 0, parts: 0 });
  assert.deepEqual(f.reads, ['db']);
});

test('a new root refreshes accounting despite unchanged parts, including revision digit growth and registry/trash-only edits', async () => {
  const data = fixture(),
    f = await stored(data);
  const changed = structuredClone(data);
  changed.revision = 10;
  changed.trash = [];
  changed._fileGc = [];
  changed._fileRegistry['id:active'].bytes = null;
  const next = await writeCatalogShards(changed, f.root._fileCatalog, () => assert.fail('No changed file parts'));
  assert.deepEqual(next._fileCatalog.shards, f.root._fileCatalog.shards);
  const value = readCatalogAccounting(next);
  assert.equal(value.catalogBytes, createCatalogAccounting(data).catalogBytes + 1, 'Revision digits are part of the exact transport envelope');
  assert.equal(value.fileStorage.activePhysical.unknownFiles, 1);
  assert.equal(value.fileStorage.retainedPhysical.files, 0);
  assert.equal(readCatalogAccounting(f.root).fileStorage.retainedPhysical.files, 2);
  assert.deepEqual((await materializeCatalog(next, id => f.parts.get(id))).files, data.files);
});

test('invalid, stale or unsupported accounting fails explicitly and never turns unknown storage into zero', async () => {
  const f = await stored();
  for (const change of [
    value => {
      value.revision++;
    },
    value => {
      value.version = 2;
    },
    value => {
      value.catalogBytes = 0;
    },
    value => {
      value.fileStorage.logical.files++;
    },
    value => {
      value.fileStorage.logical.unknownFiles = 6;
    },
    value => {
      value.fileStorage.activePhysical.knownBytes = -1;
    },
    value => {
      value.fileStorage.activePhysical.files = 8;
    },
    value => {
      value.fileStorage.retainedPhysical.unknownFiles = null;
    },
    value => {
      value.fileStorage.aliases = 5;
    },
    value => {
      value.fileStorage.backupPhysicalBytes = 0;
    },
  ]) {
    const root = structuredClone(f.root);
    change(root._fileCatalog.accounting);
    assert.throws(() => readCatalogAccounting(root), { code: 'FILE_CATALOG_CORRUPT' });
  }
  f.root._fileCatalog.accounting.revision++;
  await assert.rejects(f.provider.loadDatabaseStatus(), { code: 'FILE_CATALOG_CORRUPT' });
  assert.deepEqual(f.reads, ['db'], 'Bad summaries must not silently fall back to stub accounting');
  assert.deepEqual((await materializeCatalog(f.root, id => f.parts.get(id))).files, fixture().files, 'Derived corruption never replaces canonical data');
});

test('failed root publication cannot update the prior accounting snapshot', async () => {
  const data = fixture(),
    f = await stored(data),
    before = structuredClone(f.root);
  await assert.rejects(
    writeCatalogShards({ ...data, revision: 10, files: [{ ...data.files[0], name: 'Changed' }] }, f.root._fileCatalog, () => {
      throw Error('Interrupted');
    }),
    /Interrupted/,
  );
  assert.deepEqual(f.root, before);
  assert.deepEqual(readCatalogAccounting(f.root).fileStorage, fileStorageAccounting(data));
});
