import test from 'node:test';
import assert from 'node:assert/strict';
import { getStorageProvider, resetStorageProvider } from '../../src/server/storage/index.js';
import {
  createEmptyDatabase,
  createWorkspaceBackup,
  importPortableWorkspace,
  resetWorkspaceStore,
  restoreWorkspaceBackup,
} from '../../src/server/workspace-store.js';
import { replaceWorkspaceDocument } from '../../src/server/workspace-document-store.js';
import { rememberStorageVersion } from '../../src/server/storage/version-token.js';

function fixture(t) {
  const keys = ['VERCEL', 'WORKSPACE_WRITE_MODE', 'REDIS_URL'];
  const env = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  delete process.env.VERCEL;
  resetStorageProvider();
  resetWorkspaceStore();
  const storage = getStorageProvider();
  let stored = {
    ...createEmptyDatabase(),
    _aggregateVersion: 1,
    revision: 4,
    files: [{ id: 'f', project: 'p', name: 'Guide.txt', history: ['canonical metadata'], bytes: 12 }],
    _documentRevisions: { knowledge: { revision: 2 }, bookmarks: { revision: 0 } },
  };
  const reads = { full: 0, core: 0, writes: 0 };
  const backups = [];
  storage.init = async () => {};
  storage.loadDatabase = async () => {
    reads.full++;
    return rememberStorageVersion(structuredClone(stored), `v${stored.revision}`);
  };
  storage.loadDatabaseCore = async ({ identities }) => {
    assert.equal(identities, false);
    reads.core++;
    return { ...structuredClone(stored), files: [] };
  };
  storage.saveDatabase = async (next, options) => {
    assert.equal(options.expectedEtag, `v${stored.revision}`);
    reads.writes++;
    stored = structuredClone(next);
  };
  storage.createDatabaseBackup = async (data, label) => {
    backups.push({ data: structuredClone(data), label });
    return { id: `backup-${backups.length}` };
  };
  storage.loadDatabaseBackup = async () => ({ ...structuredClone(stored), revision: 1, files: [], ws: { name: 'Restored' } });
  process.env.VERCEL = '1';
  process.env.WORKSPACE_WRITE_MODE = 'drive';
  delete process.env.REDIS_URL;
  t.after(() => {
    for (const key of keys) {
      if (env[key] === undefined) delete process.env[key];
      else process.env[key] = env[key];
    }
    resetStorageProvider();
    resetWorkspaceStore();
  });
  return { reads, backups, storage, data: () => structuredClone(stored), externalEdit: () => stored.revision++ };
}

test('a cold document save reads the canonical catalog once, preserves full records and rejects stale document revisions', async t => {
  const f = fixture(t);
  const saved = await replaceWorkspaceDocument('knowledge', { knowledgeNotes: [{ id: 'n', title: 'Заметка' }], knowledgeFolders: [] }, 2);
  assert.equal(saved.revision, 3);
  assert.deepEqual(f.reads, { full: 1, core: 1, writes: 1 });
  assert.deepEqual(f.data().files[0].history, ['canonical metadata']);
  assert.equal(f.data().revision, 5);
  await assert.rejects(replaceWorkspaceDocument('knowledge', { knowledgeNotes: [], knowledgeFolders: [] }, 2), { code: 'REVISION_CONFLICT' });
  assert.equal(f.reads.writes, 1);
  assert.equal(f.data().knowledgeNotes[0].title, 'Заметка');
});

test('restore backs up the exact canonical baseline with one catalog load; stale requests never write or back up', async t => {
  const f = fixture(t);
  const restored = await restoreWorkspaceBackup('old', 4);
  assert.deepEqual(f.reads, { full: 1, core: 0, writes: 1 });
  assert.equal(restored.revision, 5);
  assert.equal(restored.ws.name, 'Restored');
  assert.equal(f.backups.length, 1);
  assert.equal(f.backups[0].label, 'Before restore');
  assert.equal(f.backups[0].data.revision, 4);
  assert.deepEqual(f.backups[0].data.files[0].history, ['canonical metadata']);
  await assert.rejects(restoreWorkspaceBackup('old', 4), { code: 'REVISION_CONFLICT' });
  assert.equal(f.backups.length, 1);
  assert.equal(f.reads.writes, 1);
});

test('a failed safety backup prevents restore publication', async t => {
  const f = fixture(t);
  f.storage.createDatabaseBackup = async () => {
    throw new Error('Backup unavailable');
  };
  await assert.rejects(restoreWorkspaceBackup('old', 4), /Backup unavailable/);
  assert.equal(f.reads.full, 1);
  assert.equal(f.reads.writes, 0);
  assert.equal(f.data().revision, 4);
});

test('portable import reuses its canonical mutation baseline for the recovery point', async t => {
  const f = fixture(t);
  const result = await importPortableWorkspace({ notes: [{ id: 'n', title: 'Imported', formatted_markdown: '# Guide' }] }, 4);
  assert.deepEqual(f.reads, { full: 1, core: 0, writes: 1 });
  assert.equal(result.backupId, 'backup-1');
  assert.equal(f.backups[0].data.revision, 4);
  assert.deepEqual(f.backups[0].data.files[0].history, ['canonical metadata']);
  assert.equal(f.backups[0].data.knowledgeNotes.length, 0);
  assert.equal(f.data().knowledgeNotes[0].title, 'Imported');
});

test('standalone backups refresh even an otherwise reusable worker snapshot', async t => {
  const f = fixture(t);
  await createWorkspaceBackup('First');
  f.externalEdit();
  await createWorkspaceBackup('Fresh');
  assert.equal(f.reads.full, 2);
  assert.deepEqual(
    f.backups.map(item => item.data.revision),
    [4, 5],
  );
  assert.deepEqual(f.backups[1].data.files[0].history, ['canonical metadata']);
});
