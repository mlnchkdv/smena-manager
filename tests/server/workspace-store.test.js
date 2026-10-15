import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { resetStorageProvider } from '../../src/server/storage/index.js';
import { getWorkspaceDatabase, replaceWorkspaceDatabase, resetWorkspaceStore, RevisionConflictError } from '../../src/server/workspace-store.js';

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

  const updated = await replaceWorkspaceDatabase({ ...initial, tasks: [{ id: 'task-1' }] }, initial.revision);
  assert.equal(updated.revision, 1);
  assert.deepEqual(updated.tasks, [{ id: 'task-1' }]);

  resetStorageProvider();
  resetWorkspaceStore();
  const restored = await getWorkspaceDatabase();
  assert.equal(restored.revision, 1);
  assert.deepEqual(restored.tasks, [{ id: 'task-1' }]);
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
