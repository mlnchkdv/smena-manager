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
  WorkspaceSizeError,
  WorkspacePermissionError,
} from '../../src/server/workspace-store.js';
import { WorkspaceValidationError } from '../../src/shared/workspace-schema.js';

const originalDatabasePath = process.env.DATABASE_PATH;
const originalVercel = process.env.VERCEL;
const originalWriteMode = process.env.WORKSPACE_WRITE_MODE;
const testDirectory = path.join(process.cwd(), '.data', 'tests', `workspace-${process.pid}`);

test.beforeEach(async () => {
  await fs.promises.rm(testDirectory, { recursive: true, force: true });
  process.env.DATABASE_PATH = path.join(testDirectory, 'workspace.json');
  delete process.env.VERCEL;
  delete process.env.REDIS_URL;
  delete process.env.WORKSPACE_WRITE_MODE;
  resetStorageProvider();
  resetWorkspaceStore();
});

test.after(async () => {
  await fs.promises.rm(testDirectory, { recursive: true, force: true });
  if (originalDatabasePath === undefined) delete process.env.DATABASE_PATH;
  else process.env.DATABASE_PATH = originalDatabasePath;
  if (originalVercel === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = originalVercel;
  if (originalWriteMode === undefined) delete process.env.WORKSPACE_WRITE_MODE;
  else process.env.WORKSPACE_WRITE_MODE = originalWriteMode;
});

test('workspace snapshots increment their revision and persist', async () => {
  const initial = await getWorkspaceDatabase();
  assert.equal(initial.revision, 0);
  assert.deepEqual(initial.knowledgeNotes, []);
  assert.deepEqual(initial.knowledgeFolders, []);
  assert.deepEqual(initial.links, []);
  assert.deepEqual(initial.linkFolders, []);

  const updated = await replaceWorkspaceDatabase(
    {
      ...initial,
      tasks: [{ id: 'task-1' }],
      knowledgeFolders: [{ id: 'kf1', name: 'Регламенты' }],
      knowledgeNotes: [{ id: 'kn1', title: 'Онбординг', folderId: 'kf1' }],
      linkFolders: [{ id: 'lf1', name: 'Инструменты' }],
      links: [{ id: 'ln1', title: 'Smena', url: 'https://example.com', folder: 'lf1' }],
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
  assert.deepEqual(restored.linkFolders, [{ id: 'lf1', name: 'Инструменты' }]);
  assert.deepEqual(restored.links, [{ id: 'ln1', title: 'Smena', url: 'https://example.com', folder: 'lf1' }]);
});

test('explicit Drive mode permits revision-checked writes on Vercel without Redis', async () => {
  const initial = await getWorkspaceDatabase();
  process.env.VERCEL = '1';
  process.env.WORKSPACE_WRITE_MODE = 'drive';

  const updated = await replaceWorkspaceDatabase({ ...initial, tasks: [{ id: 'direct-drive-task' }] }, initial.revision);

  assert.equal(updated.revision, 1);
  assert.deepEqual(updated.tasks, [{ id: 'direct-drive-task' }]);
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

test('oversized workspace snapshots are rejected before persistence', async () => {
  const initial = await getWorkspaceDatabase();

  await assert.rejects(
    () => replaceWorkspaceDatabase({ ...initial, knowledgeNotes: [{ id: 'large', formatted_markdown: 'x'.repeat(4 * 1024 * 1024) }] }, 0),
    error => {
      assert.ok(error instanceof WorkspaceSizeError);
      assert.equal(error.code, 'WORKSPACE_TOO_LARGE');
      assert.equal(error.statusCode, 413);
      assert.ok(error.actualBytes > error.maxBytes);
      return true;
    },
  );

  assert.equal((await getWorkspaceDatabase()).revision, 0);
});

test('partial workspace updates preserve collections omitted by the client', async () => {
  const initial = await getWorkspaceDatabase();
  const prepared = await replaceWorkspaceDatabase({ ...initial, comments: [{ id: 'comment-1' }], tasks: [{ id: 'task-1' }] }, 0);
  const updated = await replaceWorkspaceDatabase({ tasks: [{ id: 'task-2' }] }, prepared.revision);
  assert.deepEqual(updated.tasks, [{ id: 'task-2' }]);
  assert.deepEqual(updated.comments, [{ id: 'comment-1' }]);
});

test('malformed workspace collections are rejected without changing persisted data', async () => {
  const initial = await getWorkspaceDatabase();
  await assert.rejects(
    () => replaceWorkspaceDatabase({ ...initial, tasks: 'not-an-array' }, 0),
    error => {
      assert.ok(error instanceof WorkspaceValidationError);
      assert.equal(error.code, 'WORKSPACE_INVALID');
      assert.deepEqual(error.fields, ['tasks']);
      return true;
    },
  );
  assert.equal((await getWorkspaceDatabase()).revision, 0);
});
