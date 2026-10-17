import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { getStorageProvider, resetStorageProvider } from '../../src/server/storage/index.js';
import {
  createWorkspaceBackup,
  getWorkspaceDatabase,
  replaceWorkspaceDatabase,
  resetWorkspaceStore,
  restoreWorkspaceBackup,
} from '../../src/server/workspace-store.js';
import { getWorkspaceDocument, replaceWorkspaceDocument } from '../../src/server/workspace-document-store.js';

test('restore is atomic across core and documents, including stale revision and injected write failures', async t => {
  const directory = path.join(process.cwd(), '.data', 'tests', `atomic-${process.pid}`);
  const previousPath = process.env.DATABASE_PATH;
  process.env.DATABASE_PATH = path.join(directory, 'workspace.json');
  resetStorageProvider();
  resetWorkspaceStore();
  t.after(async () => {
    resetStorageProvider();
    resetWorkspaceStore();
    if (previousPath === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = previousPath;
    await fs.promises.rm(directory, { recursive: true, force: true });
  });
  const initial = await getWorkspaceDatabase();
  await replaceWorkspaceDatabase(
    { ...initial, ws: { name: 'Before' }, knowledgeNotes: [{ id: 'n', title: 'Before' }], links: [{ id: 'l', title: 'Before' }] },
    initial.revision,
  );
  const backup = await createWorkspaceBackup('Atomic checkpoint');
  const knowledge = await getWorkspaceDocument('knowledge');
  const coreBeforeDocument = await getWorkspaceDatabase();
  await replaceWorkspaceDocument('knowledge', { knowledgeNotes: [{ id: 'n', title: 'After' }], knowledgeFolders: [] }, knowledge.revision);
  const changed = await getWorkspaceDatabase();
  assert.equal(changed.revision, coreBeforeDocument.revision + 1);
  assert.equal(changed.knowledgeNotes[0].title, 'After');
  await assert.rejects(restoreWorkspaceBackup(backup.id, coreBeforeDocument.revision), { code: 'REVISION_CONFLICT' });
  assert.deepEqual(await getWorkspaceDatabase(), changed);

  const storage = getStorageProvider();
  const save = storage.saveDatabase.bind(storage);
  storage.saveDatabase = async () => {
    throw new Error('Injected disk failure');
  };
  await assert.rejects(restoreWorkspaceBackup(backup.id, changed.revision), /Injected disk failure/u);
  storage.saveDatabase = save;
  assert.deepEqual(await getWorkspaceDatabase(), changed);
  resetWorkspaceStore();
  assert.deepEqual(await getWorkspaceDatabase(), changed);

  const restored = await restoreWorkspaceBackup(backup.id, changed.revision);
  assert.equal(restored.knowledgeNotes[0].title, 'Before');
  assert.equal(restored.links[0].title, 'Before');
  assert.equal(restored.ws.name, 'Before');
  assert.equal(restored.revision, changed.revision + 1);
  assert.equal((await getWorkspaceDocument('knowledge')).revision, knowledge.revision + 2);
});
