import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import { GoogleDriveStorageProvider } from '../../src/server/storage/google-drive.js';
import { writeCatalogShards } from '../../src/server/storage/file-catalog-shards.js';
import { createEmptyDatabase } from '../../src/server/workspace-store.js';
import { indexStoredFiles } from '../../src/server/file-registry.js';

async function fixture() {
  const data = {
    ...createEmptyDatabase(),
    _aggregateVersion: 1,
    revision: 8,
    projects: [{ id: 'a' }, { id: 'b' }],
    files: Array.from({ length: 2400 }, (_, i) => ({
      id: `f${i}`,
      project: i % 2 ? 'a' : 'b',
      name: `Инструкция ${i}.md`,
      storageFileId: `physical-${i}`,
      storageName: `${i}.md`,
      bytes: i,
      history: ['полная история'.repeat(100)],
    })),
  };
  indexStoredFiles(data);
  const parts = new Map();
  const root = await writeCatalogShards(data, null, async text => {
    const id = `part-${parts.size}`;
    parts.set(id, text);
    return id;
  });
  const storage = new GoogleDriveStorageProvider();
  storage.readDatabaseRoot = async () => structuredClone(root);
  storage.readCatalogPart = async id => parts.get(id);
  storage.ensureBackupsFolder = async () => 'backups';
  const uploads = [];
  storage.client = {
    files: {
      create: async request => {
        let text = '';
        for await (const chunk of request.media.body) text += chunk;
        uploads.push(text);
        return { data: { id: 'backup' } };
      },
    },
  };
  return { data, root, storage, parts, uploads };
}

test('cold copies verify every part and spool complete metadata in exact global order without materializing a canonical snapshot', async () => {
  const f = await fixture();
  const before = (await fs.readdir(os.tmpdir())).filter(name => name.startsWith('smena-backup-')).sort();
  f.storage.loadDatabase = () => assert.fail('Cold backups must not materialize the catalog');
  const result = await f.storage.createColdDatabaseBackup('Холодная копия', async core => {
    assert.equal(core.files.length, 0);
    return true;
  });
  assert.equal(result.id, 'backup');
  assert.equal(result.size, Buffer.byteLength(f.uploads[0]));
  assert.deepEqual(JSON.parse(f.uploads[0]).data, f.data);
  assert.deepEqual((await fs.readdir(os.tmpdir())).filter(name => name.startsWith('smena-backup-')).sort(), before);
});

test('corruption in a late part or false accounting prevents any backup upload', async () => {
  for (const kind of ['part', 'accounting', 'references']) {
    const f = await fixture();
    if (kind === 'part') f.parts.set(f.root._fileCatalog.shards.at(-1).id, '[]');
    if (kind === 'accounting') f.root._fileCatalog.accounting.catalogBytes++;
    if (kind === 'references') f.root._fileCatalog.physicalReferences.entries[0][1]++;
    await assert.rejects(
      f.storage.createColdDatabaseBackup('Bad', async () => true),
      { code: 'FILE_CATALOG_CORRUPT' },
    );
    assert.equal(f.uploads.length, 0);
  }
});

test('migration, registry repairs and legacy layouts fall back before publishing; upload failures clean the spool', async () => {
  const f = await fixture();
  assert.equal(await f.storage.createColdDatabaseBackup('Migration', async () => false), null);
  f.root._fileRegistry = {};
  // Keep accounting internally consistent with the intentionally missing registry.
  f.root._fileCatalog.accounting.fileStorage.activePhysical = { files: 2400, knownBytes: 0, unknownFiles: 2400 };
  assert.equal(await f.storage.createColdDatabaseBackup('Registry', async () => true), null);
  assert.equal(f.uploads.length, 0);
  const g = await fixture();
  const before = (await fs.readdir(os.tmpdir())).filter(name => name.startsWith('smena-backup-')).sort();
  g.storage.client.files.create = async () => {
    throw new Error('Upload failed');
  };
  await assert.rejects(
    g.storage.createColdDatabaseBackup('Fail', async () => true),
    /Upload failed/,
  );
  assert.deepEqual((await fs.readdir(os.tmpdir())).filter(name => name.startsWith('smena-backup-')).sort(), before);
});
