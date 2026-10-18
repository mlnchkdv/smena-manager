import assert from 'node:assert/strict';
import test from 'node:test';
import { createDraftJournal } from '../../src/core/offline-drafts.js';
import { createPersonalPreferenceSync } from '../../src/core/personal-preferences.js';

function fixture(write) {
  const records = new Map();
  const events = [];
  const timers = new Set();
  let session = 1;
  const adapter = { get: async key => records.get(key), put: async value => records.set(value.key, value), delete: async key => records.delete(key) };
  const options = {
    write,
    session: () => session,
    notify: event => events.push(event),
    createJournal: context => createDraftJournal(context, adapter),
    schedule: fn => {
      timers.add(fn);
      return fn;
    },
    cancel: fn => timers.delete(fn),
  };
  return {
    options,
    records,
    events,
    timers,
    changeSession: () => {
      session += 1;
    },
    sync: createPersonalPreferenceSync(options),
  };
}

test('preferences retry without another edit and preserve only changed fields', async () => {
  const writes = [];
  let fails = true;
  const f = fixture(async data => {
    writes.push(data);
    if (fails) throw new Error('offline');
  });
  await f.sync.configure('alice', { theme: 'light', lang: 'Русский' }, { workspace: 'team' });
  await f.sync.retry();
  await f.sync.queue('alice', { theme: 'dark', lang: 'Русский' });
  assert.equal(f.sync.state().status, 'offline');
  assert.equal(f.records.size, 1);
  fails = false;
  const callback = [...f.timers][0];
  assert.equal(typeof callback, 'function');
  callback();
  await f.sync.retry();
  assert.equal(f.sync.state().pending, false);
  assert.equal(f.records.size, 0);
  assert.deepEqual(writes, [{ preferences: { theme: 'dark' } }, { preferences: { theme: 'dark' } }]);
});

test('reload restores the local preference delta without reverting unrelated remote preferences', async () => {
  const f = fixture(async () => {
    throw new Error('offline');
  });
  await f.sync.configure('alice', { theme: 'light', lang: 'Русский' }, { workspace: 'team' });
  await f.sync.retry();
  await f.sync.queue('alice', { theme: 'dark', lang: 'Русский' });
  const writes = [];
  const restored = createPersonalPreferenceSync({ ...f.options, write: async data => writes.push(data) });
  assert.deepEqual(await restored.configure('alice', { theme: 'light', lang: 'English (US)' }, { workspace: 'team' }), { theme: 'dark', lang: 'English (US)' });
  await restored.retry();
  assert.deepEqual(writes, [{ preferences: { theme: 'dark' } }]);
  assert.equal(f.records.size, 0);
  const other = createPersonalPreferenceSync(f.options);
  assert.deepEqual(await other.configure('bob', { theme: 'light' }, { workspace: 'team' }), { theme: 'light' });
});

test('A to B to A edits during a write cannot acknowledge away the latest intent', async () => {
  let finish;
  const writes = [];
  const f = fixture(async data => {
    writes.push(data);
    if (writes.length === 1)
      await new Promise(resolve => {
        finish = resolve;
      });
  });
  await f.sync.configure('alice', { theme: 'light' });
  await f.sync.retry();
  const first = f.sync.queue('alice', { theme: 'dark' });
  while (!finish) await new Promise(resolve => setImmediate(resolve));
  const second = f.sync.queue('alice', { theme: 'light' });
  finish();
  await Promise.all([first, second]);
  assert.deepEqual(writes, [{ preferences: { theme: 'dark' } }, { preferences: { theme: 'light' } }]);
  assert.equal(f.sync.state().pending, false);
  assert.equal(f.records.size, 0);
});

test('a reload acknowledges a draft already stored remotely instead of replaying it on later sessions', async () => {
  const f = fixture(async () => {
    throw new Error('offline');
  });
  await f.sync.configure('alice', { theme: 'light', lang: 'Русский' });
  await f.sync.retry();
  await f.sync.queue('alice', { theme: 'dark', lang: 'Русский' });
  const writes = [];
  const restored = createPersonalPreferenceSync({ ...f.options, write: async data => writes.push(data) });
  await restored.configure('alice', { theme: 'dark', lang: 'English (US)' });
  await restored.retry();
  assert.equal(f.records.size, 0);
  await restored.configure('alice', { theme: 'light', lang: 'English (US)' });
  await restored.retry();
  assert.deepEqual(writes, []);
});

test('an old account retry cannot send preferences with a new session cookie', async () => {
  let writes = 0;
  const f = fixture(async () => {
    writes += 1;
    throw new Error('offline');
  });
  await f.sync.configure('alice', { theme: 'light' });
  await f.sync.retry();
  await f.sync.queue('alice', { theme: 'dark' });
  f.changeSession();
  for (const callback of f.timers) callback();
  await f.sync.retry();
  await f.sync.queue('alice', { theme: 'light' });
  assert.equal(writes, 1);
  assert.equal(f.records.size, 1);
  await f.sync.configure('bob', { theme: 'light' });
  await f.sync.retry();
  assert.equal(f.sync.state().owner, 'bob');
  assert.equal(writes, 1);
});

test('a recovery quota error warns without preventing a successful server preference write', async () => {
  const events = [];
  const writes = [];
  const sync = createPersonalPreferenceSync({
    session: () => 1,
    notify: event => events.push(event),
    write: async data => writes.push(data),
    createJournal: () => ({
      read: async () => null,
      save: async () => {
        throw new Error('quota');
      },
      acknowledge: async () => {},
    }),
  });
  await sync.configure('alice', { theme: 'light' });
  await sync.retry();
  await sync.queue('alice', { theme: 'dark' });
  assert.equal(
    events.some(event => event.status === 'recovery_unavailable'),
    true,
  );
  assert.equal(sync.state().status, 'saved');
  assert.deepEqual(writes, [{ preferences: { theme: 'dark' } }]);
});
