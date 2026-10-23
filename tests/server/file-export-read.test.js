import test from 'node:test';
import assert from 'node:assert/strict';
import { getStorageProvider, resetStorageProvider } from '../../src/server/storage/index.js';
import { getWorkspaceExportSnapshot, getWorkspaceFilesSnapshot } from '../../src/server/workspace-store.js';
import { catalogCore, readCatalogShards, writeCatalogShards } from '../../src/server/storage/file-catalog-shards.js';

test('export read uses one coherent root and only the owning live job parts, rechecking current ACLs', async t => {
  resetStorageProvider();
  const storage = getStorageProvider();
  const oldLoad = storage.loadDatabaseCatalog;
  t.after(() => {
    storage.loadDatabaseCatalog = oldLoad;
    resetStorageProvider();
  });
  const parts = new Map();
  const data = {
    ws: { id: 'workspace' },
    revision: 1,
    members: [{ id: 'm', role: 'Member' }],
    projects: [{ id: 'p' }, { id: 'private', private: true, members: ['else'] }],
    files: [
      { id: 'f', project: 'p', storageFileId: 'drive-f' },
      { id: 'secret', project: 'private' },
    ],
    _fileExportJobs: [{ id: 'job', owner: 'm', workspace: 'workspace', phase: 'ready', expiresAt: Date.now() + 60000, entries: [{ file: { id: 'f' } }] }],
  };
  let root = await writeCatalogShards(data, null, async text => {
    const id = `part-${parts.size}`;
    parts.set(id, text);
    return id;
  });
  let reads = [];
  storage.loadDatabaseCatalog = async select => {
    const core = catalogCore(root);
    return {
      ...core,
      files: await readCatalogShards(
        root,
        id => {
          reads.push(id);
          return parts.get(id);
        },
        select(core),
      ),
    };
  };
  const user = { id: 'm', role: 'admin' }; // The fresh member, not this stale role, governs the read.
  assert.deepEqual((await getWorkspaceExportSnapshot(user)).files, data.files.slice(0, 1));
  assert.deepEqual(reads, [root._fileCatalog.shards[0].id]);
  reads = [];
  assert.deepEqual((await getWorkspaceFilesSnapshot(user, ['f', 'secret'])).files, data.files.slice(0, 1));
  assert.deepEqual(reads, [root._fileCatalog.shards[0].id], 'Batch ZIP reads do not fetch a private project');
  reads = [];
  assert.deepEqual((await getWorkspaceFilesSnapshot(user, [])).files, []);
  await assert.rejects(getWorkspaceFilesSnapshot(user, 'f'), TypeError);
  await assert.rejects(getWorkspaceFilesSnapshot(user, Array(501).fill('f')), TypeError);
  assert.deepEqual(reads, []);
  reads = [];
  assert.deepEqual((await getWorkspaceExportSnapshot({ id: 'other', role: 'editor' })).files, []);
  assert.deepEqual(reads, []);
  root.projects[0] = { id: 'p', private: true, members: ['else'] };
  assert.deepEqual((await getWorkspaceExportSnapshot(user, 'job')).files, []);
  assert.deepEqual(reads, []);
  root.members[0].status = 'deactivated';
  await assert.rejects(getWorkspaceExportSnapshot(user), { code: 'AUTH_REQUIRED' });
  root.members[0].status = 'active';
  root._fileExportJobs[0].expiresAt = 0;
  assert.deepEqual((await getWorkspaceExportSnapshot(user)).files, []);
  assert.deepEqual(reads, []);
});
