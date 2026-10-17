import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorkspaceSync } from '../../src/core/workspace-sync.js';

const tick = () => new Promise(resolve => setImmediate(resolve));

test('returning A to B to A while B is saving persists the final A', async () => {
  let release;
  const writes = [];
  const a = { tasks: [{ id: 't', title: 'A' }] };
  const b = { tasks: [{ id: 't', title: 'B' }] };
  const sync = createWorkspaceSync({
    notify: () => {},
    writeWorkspace: async (data, revision) => {
      writes.push(structuredClone(data));
      if (writes.length === 1)
        await new Promise(resolve => {
          release = resolve;
        });
      return { ...data, revision: revision + 1 };
    },
  });
  sync.configure(1, 'editor', a);
  const first = sync.queue(b);
  void sync.queue(a);
  release();
  await first;
  await tick();
  assert.deepEqual(writes, [b, a]);
  assert.equal(sync.isClean(a), true);
});

test('a return to the active value cancels an obsolete pending value', async () => {
  let release;
  const writes = [];
  const sync = createWorkspaceSync({
    notify: () => {},
    writeWorkspace: async (data, revision) => {
      writes.push(data);
      await new Promise(resolve => {
        release = resolve;
      });
      return { ...data, revision: revision + 1 };
    },
  });
  sync.configure(1, 'editor', { value: 'A' });
  const first = sync.queue({ value: 'B' });
  void sync.queue({ value: 'C' });
  void sync.queue({ value: 'B' });
  release();
  await first;
  await tick();
  assert.deepEqual(writes, [{ value: 'B' }]);
});

test('server canonical data is confirmed and pending edits are rebased onto it', async () => {
  let release;
  const events = [];
  const writes = [];
  const sync = createWorkspaceSync({
    notify: event => events.push(event),
    writeWorkspace: async (data, revision) => {
      writes.push(structuredClone(data));
      if (writes.length === 1)
        await new Promise(resolve => {
          release = resolve;
        });
      return { ...data, title: 'sanitized', serverOwned: 'trusted', revision: revision + 1 };
    },
  });
  sync.configure(1, 'editor', { title: 'old', value: 0 });
  const first = sync.queue({ title: 'unsafe', value: 1 });
  void sync.queue({ title: 'unsafe', value: 2 });
  release();
  await first;
  await tick();
  assert.deepEqual(writes[1], { title: 'sanitized', value: 2, serverOwned: 'trusted' });
  assert.equal(sync.isClean({ title: 'sanitized', value: 2, serverOwned: 'trusted' }), true);
  assert.equal(events.find(event => event.status === 'saved').sentData.title, 'unsafe');
});

test('a late response from a previous session cannot replace the new session state', async () => {
  let release;
  const events = [];
  const sync = createWorkspaceSync({
    notify: event => events.push(event),
    writeWorkspace: async data => {
      await new Promise(resolve => {
        release = resolve;
      });
      return { ...data, revision: 99 };
    },
  });
  sync.configure(1, 'editor', { value: 'old' });
  const old = sync.queue({ value: 'old change' });
  sync.disable();
  sync.configure(5, 'editor', { value: 'new session' });
  release();
  await old;
  assert.equal(sync.state().revision, 5);
  assert.equal(sync.isClean({ value: 'new session' }), true);
  assert.equal(
    events.some(event => event.status === 'saved'),
    false,
  );
});

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
  assert.equal(sync.state().hasConflict, true);
  assert.deepEqual(sync.getConflict().local, { tasks: [] });
  assert.equal(statuses.at(-1).status, 'conflict');
  assert.equal(statuses.at(-1).currentRevision, 8);
});

test('workspace sync reports when the current data is safe to refresh', async () => {
  const data = { tasks: [{ id: 't1', title: 'Original' }] };
  const sync = createWorkspaceSync({
    writeWorkspace: async (next, revision) => ({ ...next, revision: revision + 1 }),
    notify: () => {},
  });

  sync.configure(1, 'editor', data);
  assert.equal(sync.isClean(structuredClone(data)), true);
  assert.equal(sync.isClean({ tasks: [{ id: 't1', title: 'Changed' }] }), false);

  const changed = { tasks: [{ id: 't1', title: 'Changed' }] };
  await sync.queue(changed);
  assert.equal(sync.isClean(changed), true);
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

test('workspace sync distinguishes a server outage from an offline browser', async () => {
  const statuses = [];
  const sync = createWorkspaceSync({
    writeWorkspace: async () => {
      throw Object.assign(new Error('unavailable'), { status: 503, code: 'STORAGE_UNAVAILABLE' });
    },
    notify: event => statuses.push(event.status),
    schedule: () => 1,
    cancel: () => {},
  });

  sync.configure(1, 'admin');
  await sync.queue({ tasks: [{ id: 'queued' }] });

  assert.equal(sync.state().hasPending, true);
  assert.deepEqual(statuses, ['syncing', 'unavailable']);
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

test('workspace sync stops retrying structurally invalid data', async () => {
  const events = [];
  let writes = 0;
  const sync = createWorkspaceSync({
    writeWorkspace: async () => {
      writes += 1;
      throw Object.assign(new Error('Invalid workspace.'), { status: 400, code: 'WORKSPACE_INVALID' });
    },
    notify: event => events.push(event.status),
  });
  sync.configure(1, 'editor', { tasks: [] });
  await sync.queue({ tasks: 'invalid' });
  assert.equal(writes, 1);
  assert.equal(sync.state().enabled, false);
  assert.deepEqual(events, ['syncing', 'invalid']);
});
