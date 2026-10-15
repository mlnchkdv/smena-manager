import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorkspaceSync } from '../../src/core/workspace-sync.js';

test('workspace sync advances revisions after successful writes', async () => {
  const writes = [];
  const statuses = [];
  const sync = createWorkspaceSync({
    writeWorkspace: async (data, revision) => {
      writes.push({ data, revision });
      return { ...data, revision: revision + 1 };
    },
    notify: event => statuses.push(event.status),
  });

  sync.configure(3, 'editor');
  await sync.queue({ tasks: [{ id: 't1' }] });

  assert.deepEqual(writes, [{ data: { tasks: [{ id: 't1' }] }, revision: 3 }]);
  assert.equal(sync.state().revision, 4);
  assert.deepEqual(statuses, ['syncing', 'saved']);
});

test('workspace sync skips data that is identical to the loaded snapshot', async () => {
  let writes = 0;
  const data = { tasks: [{ id: 't1' }] };
  const sync = createWorkspaceSync({
    writeWorkspace: async () => {
      writes += 1;
      return { ...data, revision: 6 };
    },
    notify: () => {},
  });

  sync.configure(5, 'editor', data);
  await sync.queue(structuredClone(data));

  assert.equal(writes, 0);
  assert.equal(sync.state().revision, 5);
});

test('workspace sync stops instead of overwriting a revision conflict', async () => {
  const statuses = [];
  const sync = createWorkspaceSync({
    writeWorkspace: async () => {
      throw Object.assign(new Error('conflict'), { status: 409, code: 'REVISION_CONFLICT', currentRevision: 8 });
    },
    notify: event => statuses.push(event),
  });

  sync.configure(7, 'admin');
  await sync.queue({ tasks: [] });

  assert.equal(sync.state().enabled, false);
  assert.equal(statuses.at(-1).status, 'conflict');
  assert.equal(statuses.at(-1).currentRevision, 8);
});

test('workspace sync keeps a failed write for an explicit retry', async () => {
  let attempt = 0;
  let scheduled;
  const statuses = [];
  const sync = createWorkspaceSync({
    writeWorkspace: async (data, revision) => {
      attempt += 1;
      if (attempt === 1) throw new Error('offline');
      return { ...data, revision: revision + 1 };
    },
    notify: event => statuses.push(event.status),
    schedule: callback => {
      scheduled = callback;
      return 1;
    },
    cancel: () => {},
  });

  sync.configure(1, 'editor');
  await sync.queue({ tasks: [{ id: 'queued' }] });
  assert.equal(sync.state().hasPending, true);
  assert.equal(typeof scheduled, 'function');

  await sync.retry();
  assert.equal(sync.state().revision, 2);
  assert.equal(sync.state().hasPending, false);
  assert.deepEqual(statuses, ['syncing', 'offline', 'syncing', 'saved']);
});

test('workspace sync does not retry an oversized snapshot forever', async () => {
  let attempt = 0;
  let scheduled = false;
  const statuses = [];
  const sync = createWorkspaceSync({
    writeWorkspace: async (data, revision) => {
      attempt += 1;
      if (attempt === 1) throw Object.assign(new Error('too large'), { status: 413, code: 'WORKSPACE_TOO_LARGE' });
      return { ...data, revision: revision + 1 };
    },
    notify: event => statuses.push(event.status),
    schedule: () => {
      scheduled = true;
      return 1;
    },
    cancel: () => {},
  });

  sync.configure(2, 'editor');
  await sync.queue({ notes: ['oversized'] });

  assert.equal(sync.state().enabled, true);
  assert.equal(sync.state().hasPending, false);
  assert.equal(scheduled, false);
  assert.deepEqual(statuses, ['syncing', 'too_large']);

  await sync.queue({ notes: [] });
  assert.equal(sync.state().revision, 3);
  assert.deepEqual(statuses, ['syncing', 'too_large', 'syncing', 'saved']);
});
