import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { resetStorageProvider } from '../../src/server/storage/index.js';
import {
  getWorkspaceDatabase,
  replaceWorkspaceDatabase,
  resetWorkspaceStore,
  RevisionConflictError,
  WorkspacePermissionError,
} from '../../src/server/workspace-store.js';

const originalDatabasePath = process.env.DATABASE_PATH;
const testDirectory = path.join(process.cwd(), '.data', 'tests', `workspace-${process.pid}`);

test.beforeEach(async () => {
  await fs.promises.rm(testDirectory, { recursive: true, force: true });
  process.env.DATABASE_PATH = path.join(testDirectory, 'workspace.json');
  delete process.env.VERCEL;
  delete process.env.REDIS_URL;
  resetStorageProvider();
  resetWorkspaceStore();
});

test.after(async () => {
  await fs.promises.rm(testDirectory, { recursive: true, force: true });
  if (originalDatabasePath === undefined) delete process.env.DATABASE_PATH;
  else process.env.DATABASE_PATH = originalDatabasePath;
});

test('workspace snapshots increment their revision and persist', async () => {
  const initial = await getWorkspaceDatabase();
  assert.equal(initial.revision, 0);
  assert.deepEqual(initial.knowledgeNotes, []);
  assert.deepEqual(initial.knowledgeFolders, []);

  const updated = await replaceWorkspaceDatabase(
    {
      ...initial,
      tasks: [{ id: 'task-1' }],
      knowledgeFolders: [{ id: 'kf1', name: 'Регламенты' }],
      knowledgeNotes: [{ id: 'kn1', title: 'Онбординг', folderId: 'kf1' }],
    },
    initial.revision,
  );
  assert.equal(updated.revision, 1);
  assert.deepEqual(updated.tasks, [{ id: 'task-1' }]);

  resetStorageProvider();
  resetWorkspaceStore();
  const restored = await getWorkspaceDatabase();
  assert.equal(restored.revision, 1);
  assert.deepEqual(restored.tasks, [{ id: 'task-1' }]);
  assert.deepEqual(restored.knowledgeFolders, [{ id: 'kf1', name: 'Регламенты' }]);
  assert.deepEqual(restored.knowledgeNotes, [{ id: 'kn1', title: 'Онбординг', folderId: 'kf1' }]);
});

test('stale workspace revisions are rejected', async () => {
  const initial = await getWorkspaceDatabase();
  await replaceWorkspaceDatabase(initial, 0);

  await assert.rejects(
    () => replaceWorkspaceDatabase(initial, 0),
    error => {
      assert.ok(error instanceof RevisionConflictError);
      assert.equal(error.currentRevision, 1);
      return true;
    },
  );
});

test('editors can change tasks but cannot change administrator fields', async () => {
  const initial = await getWorkspaceDatabase();
  const withTask = await replaceWorkspaceDatabase({ ...initial, tasks: [{ id: 'task-1' }] }, 0, { role: 'editor' });
  assert.equal(withTask.revision, 1);

  await assert.rejects(
    () => replaceWorkspaceDatabase({ ...withTask, members: [{ id: 'member-1' }] }, 1, { role: 'editor' }),
    error => {
      assert.ok(error instanceof WorkspacePermissionError);
      assert.deepEqual(error.fields, ['members']);
      return true;
    },
  );
});

test('a client-specific current member never replaces the shared canonical member', async () => {
  const initial = await getWorkspaceDatabase();
  const prepared = await replaceWorkspaceDatabase({ ...initial, me: 'm1', members: [{ id: 'm1' }, { id: 'm2' }], tasks: [] }, 0, { role: 'admin' });
  const updated = await replaceWorkspaceDatabase({ ...prepared, me: 'm2', tasks: [{ id: 'task-2' }] }, 1, { role: 'editor' });
  assert.equal(updated.me, 'm1');
  assert.deepEqual(updated.tasks, [{ id: 'task-2' }]);
});
