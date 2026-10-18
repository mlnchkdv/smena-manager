import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { resetStorageProvider } from '../../src/server/storage/index.js';
import {
  getWorkspaceDatabase,
  getWorkspaceRevisionStatus,
  getWorkspaceStatus,
  replaceWorkspaceDatabase,
  resetWorkspaceStore,
  RevisionConflictError,
  WorkspaceSizeError,
  WorkspacePermissionError,
  createWorkspaceBackup,
  restoreWorkspaceBackup,
} from '../../src/server/workspace-store.js';
import { WorkspaceValidationError } from '../../src/shared/workspace-schema.js';
import { WorkspaceMembershipError } from '../../src/shared/workspace-membership.js';
import { workspaceGraph } from '../../src/shared/relations.js';

const originalDatabasePath = process.env.DATABASE_PATH;
const originalVercel = process.env.VERCEL;
const originalWriteMode = process.env.WORKSPACE_WRITE_MODE;
const testDirectory = path.join(process.cwd(), '.data', 'tests', `workspace-${process.pid}`);
const canonicalTask = id => ({ id, title: '', desc: '', status: 'todo', priority: 'none', subtasks: [], attachments: [], deps: [], labels: [] });

test('backup restore retains manual file references and stable wiki bindings across document changes', async () => {
  const previousBackupsPath = process.env.BACKUPS_PATH;
  process.env.BACKUPS_PATH = path.join(testDirectory, 'backups');
  try {
    const initial = await getWorkspaceDatabase();
    const saved = await replaceWorkspaceDatabase(
      {
        ...initial,
        projects: [{ id: 'p', name: 'P' }],
        files: [{ id: 'f', project: 'p', name: 'guide.txt' }],
        knowledgeNotes: [
          { id: 'a', title: 'A', formatted_markdown: '[[B]]' },
          { id: 'b', title: 'B' },
        ],
        relations: [{ id: 'r', from: 'note:a', to: 'file:f', type: 'source' }],
      },
      initial.revision,
    );
    const backup = await createWorkspaceBackup('Graph acceptance');
    const changed = await replaceWorkspaceDatabase({ ...saved, files: [], knowledgeNotes: [] }, saved.revision);
    assert.equal(
      workspaceGraph(changed, { role: 'admin' }).edges.some(edge => edge.id === 'r'),
      false,
    );
    const restored = await restoreWorkspaceBackup(backup.id, changed.revision);
    assert.equal(restored.knowledgeNotes[0].wikiRefs[0].target, 'b');
    assert.ok(workspaceGraph(restored, { role: 'admin' }).edges.some(edge => edge.id === 'r'));
    resetWorkspaceStore();
    resetStorageProvider();
    assert.equal((await getWorkspaceDatabase()).relations[0].to, 'file:f');
  } finally {
    if (previousBackupsPath === undefined) delete process.env.BACKUPS_PATH;
    else process.env.BACKUPS_PATH = previousBackupsPath;
  }
});

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
  assert.deepEqual(updated.tasks, [canonicalTask('task-1')]);

  resetStorageProvider();
  resetWorkspaceStore();
  const restored = await getWorkspaceDatabase();
  assert.equal(restored.revision, 1);
  assert.deepEqual(restored.tasks, [canonicalTask('task-1')]);
  assert.deepEqual(restored.knowledgeFolders, [{ id: 'kf1', name: 'Регламенты' }]);
  assert.deepEqual(restored.knowledgeNotes, [{ id: 'kn1', title: 'Онбординг', folderId: 'kf1' }]);
  assert.deepEqual(restored.linkFolders, [{ id: 'lf1', name: 'Инструменты' }]);
  assert.deepEqual(restored.links, [{ id: 'ln1', title: 'Smena', url: 'https://example.com', folder: 'lf1' }]);
});

test('workspace revision status returns synchronization metadata without changing data', async () => {
  const initial = await getWorkspaceDatabase();
  const status = await getWorkspaceRevisionStatus();
  assert.equal(status.revision, initial.revision);
  assert.equal(status.updatedAt, initial.updatedAt);
});

test('workspace status reports local write coordination outside Vercel', async () => {
  const status = await getWorkspaceStatus();
  assert.deepEqual(status.coordination, { mode: 'local-queue', healthy: true, latencyMs: null });
});

test('workspace store blocks removal of the last active administrator', async () => {
  const initial = await getWorkspaceDatabase();
  const withAdmin = await replaceWorkspaceDatabase(
    {
      ...initial,
      members: [{ id: 'admin-1', name: 'Admin', email: 'admin@example.test', role: 'Admin', status: 'active' }],
    },
    initial.revision,
    { role: 'admin', actorMemberId: 'admin-1' },
  );
  await assert.rejects(
    replaceWorkspaceDatabase({ ...withAdmin, members: [{ ...withAdmin.members[0], status: 'deactivated' }] }, withAdmin.revision, {
      role: 'admin',
      actorMemberId: 'admin-1',
    }),
    error => error instanceof WorkspaceMembershipError && error.code === 'LAST_ADMIN_REQUIRED',
  );
});

test('explicit Drive mode permits revision-checked writes on Vercel without Redis', async () => {
  const initial = await getWorkspaceDatabase();
  process.env.VERCEL = '1';
  process.env.WORKSPACE_WRITE_MODE = 'drive';

  const updated = await replaceWorkspaceDatabase({ ...initial, tasks: [{ id: 'direct-drive-task' }] }, initial.revision);

  assert.equal(updated.revision, 1);
  assert.deepEqual(updated.tasks, [canonicalTask('direct-drive-task')]);
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

  const withPreferences = await replaceWorkspaceDatabase({ ...withTask, notifPrefs: { m1: { assign_self: false } } }, 1, {
    role: 'editor',
    actorMemberId: 'm1',
  });
  assert.equal(withPreferences.revision, 2);
  assert.equal(withPreferences.notifPrefs.m1.assign_self, false);

  await assert.rejects(
    () => replaceWorkspaceDatabase({ ...withPreferences, members: [{ id: 'member-1' }] }, 2, { role: 'editor', actorMemberId: 'm1' }),
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
  assert.deepEqual(updated.tasks, [canonicalTask('task-2')]);
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
  assert.deepEqual(updated.tasks, [canonicalTask('task-2')]);
  assert.deepEqual(updated.comments, [{ id: 'comment-1', text: '', re: {} }]);
});

test('canonical optional fields and sanitized descriptions survive persistence and reload', async () => {
  const initial = await getWorkspaceDatabase();
  const updated = await replaceWorkspaceDatabase(
    {
      ...initial,
      tasks: [
        {
          id: 'safe-task',
          desc: '<p><b>Safe</b><button data-a="delWorkspace">Unsafe action</button><script>alert(1)</script></p>',
          subtasks: [{ id: 'sub', desc: '<p data-a="signOut">Safe subtask<script>alert(1)</script></p>' }],
        },
      ],
    },
    initial.revision,
  );
  assert.equal(updated.tasks[0].status, 'todo');
  assert.deepEqual(updated.tasks[0].labels, []);
  assert.match(updated.tasks[0].desc, /<b>Safe<\/b>/u);
  assert.doesNotMatch(updated.tasks[0].desc, /data-a|<button|<script/u);
  assert.doesNotMatch(updated.tasks[0].subtasks[0].desc, /data-a|<script/u);
  resetStorageProvider();
  resetWorkspaceStore();
  assert.deepEqual((await getWorkspaceDatabase()).tasks, updated.tasks);
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
