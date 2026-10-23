import test from 'node:test';
import assert from 'node:assert/strict';
import { getStorageProvider, resetStorageProvider } from '../../src/server/storage/index.js';
import { getWorkspaceDatabase, getWorkspaceStatus, resetWorkspaceStore } from '../../src/server/workspace-store.js';
import { writeCatalogShards, catalogCore } from '../../src/server/storage/file-catalog-shards.js';
import { readCatalogAccounting } from '../../src/server/file-catalog-accounting.js';
import { workspaceCapacities, fileStorageAccounting } from '../../src/server/file-capacity.js';

test('detailed status stays fresh without full reads and cannot poison the writable canonical snapshot', async t => {
  resetStorageProvider();
  resetWorkspaceStore();
  const storage = getStorageProvider();
  const previous = { load: storage.loadDatabase, status: storage.loadDatabaseStatus, info: storage.getStatus };
  t.after(() => {
    storage.loadDatabase = previous.load;
    storage.loadDatabaseStatus = previous.status;
    storage.getStatus = previous.info;
    resetStorageProvider();
    resetWorkspaceStore();
  });
  const original = {
    schemaVersion: 3,
    revision: 9,
    _aggregateVersion: 1,
    projects: [{ id: 'p', name: 'Проект' }],
    files: [
      { id: 'f', project: 'p', name: 'Справочник.md', bytes: 12, storageName: 'f', storageFileId: 'physical', history: ['private-original'] },
      { id: 'unknown', project: 'p', name: 'Unknown', bytes: null },
    ],
    knowledgeNotes: [{ id: 'note', title: 'Заметка', formatted_markdown: '# Guide' }],
    knowledgeFolders: [],
    links: [],
    linkFolders: [],
    _documentRevisions: { knowledge: { revision: 3 }, bookmarks: { revision: 2 } },
    _fileRegistry: { 'id:physical': { storageFileId: 'physical', storageName: 'f', bytes: 12, mimeType: null, verified: true } },
  };
  storage.loadDatabase = async () => structuredClone(original);
  const canonical = await getWorkspaceDatabase(); // The worker's intentionally older write baseline.
  let next = { ...canonical, revision: 10, updatedAt: '2026-10-24T01:00:00Z' };
  let root = await writeCatalogShards(next, null, async (_text, hash) => `part-${hash}`);
  let reads = 0;
  storage.loadDatabase = () => assert.fail('Status must not materialize the canonical catalog');
  storage.loadDatabaseStatus = async () => {
    reads++;
    return {
      data: catalogCore(root, { identities: false }),
      accounting: readCatalogAccounting(root),
      catalog: { layout: 'project-shards', version: 3, parts: 1 },
    };
  };
  storage.getStatus = async () => ({ provider: 'test', fileCatalog: { layout: 'aggregate', parts: 99 } });
  const first = await getWorkspaceStatus();
  assert.equal(reads, 1);
  assert.equal(first.revision, 10);
  assert.deepEqual(first.catalogAccounting, { source: 'manifest', revision: 10 });
  assert.deepEqual(
    first.capacities,
    workspaceCapacities(next, {
      knowledge: { ...next, revision: 3 },
      bookmarks: { ...next, revision: 2 },
    }),
  );
  assert.deepEqual(first.fileStorage, fileStorageAccounting(next));
  assert.equal(first.fileStorage.logical.unknownFiles, 1, 'Identity stubs must not turn null sizes into known zeroes');
  assert.equal(first.storage.fileCatalog.layout, 'project-shards', 'Layout describes the same root, not a later provider cursor');
  assert.equal(first.storage.fileCatalog.parts, 1);
  assert.equal(first.documents.knowledge.revision, 3);
  assert.equal(
    first.workspaceBytes,
    Object.values(first.capacities).reduce((sum, item) => sum + item.bytes, 0),
  );
  next = { ...next, revision: 11, files: [...next.files, { ...next.files[0], id: 'alias' }] };
  root = await writeCatalogShards(next, root._fileCatalog, async (_text, hash) => `part-${hash}`);
  const second = await getWorkspaceStatus();
  assert.equal(reads, 2);
  assert.equal(second.revision, 11);
  assert.equal(second.fileStorage.aliases, 1);
  assert.deepEqual(second.fileStorage, fileStorageAccounting(next));
  assert.deepEqual(await getWorkspaceDatabase(), canonical, 'Read-only summaries must never replace complete file records for writes/backups');
  storage.loadDatabaseStatus = async () => null;
  await assert.rejects(getWorkspaceStatus(), /does not contain a workspace/);
});

test('legacy status falls back to exact canonical records, including document revisions and unknown sizes', async t => {
  resetStorageProvider();
  resetWorkspaceStore();
  const storage = getStorageProvider(),
    previous = { status: storage.loadDatabaseStatus, info: storage.getStatus };
  t.after(() => {
    storage.loadDatabaseStatus = previous.status;
    storage.getStatus = previous.info;
    resetStorageProvider();
    resetWorkspaceStore();
  });
  storage.loadDatabaseStatus = async () => ({
    data: {
      schemaVersion: 3,
      _aggregateVersion: 1,
      revision: 4,
      files: [{ id: 'f', project: 'p', name: 'Legacy', bytes: null, history: ['x'.repeat(3000)] }],
      _documentRevisions: { knowledge: { revision: 2 }, bookmarks: { revision: 1 } },
    },
    accounting: null,
    catalog: { layout: 'project-shards', version: 2, parts: 1 },
  });
  storage.getStatus = async () => ({ provider: 'test' });
  const result = await getWorkspaceStatus();
  assert.deepEqual(result.catalogAccounting, { source: 'canonical', revision: 4 });
  assert.equal(result.fileStorage.logical.unknownFiles, 1);
  assert.ok(result.capacities.catalog.bytes > 3000);
  assert.equal(result.documents.bookmarks.revision, 1);
});
