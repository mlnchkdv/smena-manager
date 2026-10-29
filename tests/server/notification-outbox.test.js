import assert from 'node:assert/strict';
import test from 'node:test';
import { drainNotificationOutbox, enqueueNotificationEvents, enqueueDigestJobs } from '../../src/server/notification-outbox.js';

function fixture() {
  const data = {
    revision: 1,
    members: [{ id: 'm', role: 'Member' }],
    notifPrefs: { m: { email_mention: true, push_mention: true } },
    projects: [{ id: 'p', access: 'public' }],
    tasks: [{ id: 't', project: 'p' }],
    notifs: [{ id: 'n', recipient: 'm', task: 't', type: 'mention' }],
  };
  data._notificationOutbox = enqueueNotificationEvents({ notifs: [] }, data, 1);
  return data;
}

test('digest jobs are queued once and competing workers cannot send the same live lease', async () => {
  let state = fixture();
  state._notificationOutbox = [];
  state.notifPrefs.m.email_digest = true;
  const plan = { today: '2026-10-19', recipients: [state.members[0]] };
  assert.deepEqual(enqueueDigestJobs(state, plan, 1), ['m']);
  assert.deepEqual(enqueueDigestJobs(state, plan, 1), []);
  let calls = 0;
  const worker = {
    now: () => 100,
    load: async () => structuredClone(state),
    mutate: async (change, revision) => {
      if (revision !== state.revision) throw Object.assign(new Error('Conflict'), { code: 'REVISION_CONFLICT' });
      state = change(structuredClone(state));
      state.revision += 1;
      return structuredClone(state);
    },
    send: {
      email: async () => {
        calls += 1;
        return { configured: true, delivered: 1, failed: 0 };
      },
    },
  };
  await Promise.all([drainNotificationOutbox(worker), drainNotificationOutbox(worker)]);
  assert.equal(calls, 1);
  assert.equal(state.notifPrefs.m.emailDigestLastDate, plan.today);
  state._notificationOutbox = [];
  assert.deepEqual(enqueueDigestJobs(state, plan, 1), []);
});

test('outbox survives failed delivery, retries channels independently and never trusts candidate queue', async () => {
  let state = fixture();
  let now = 100;
  let emailCalls = 0;
  let pushCalls = 0;
  const worker = {
    load: async () => structuredClone(state),
    now: () => now,
    mutate: async (change, revision) => {
      assert.equal(revision, state.revision);
      state = change(structuredClone(state));
      state.revision += 1;
      return structuredClone(state);
    },
    send: {
      email: async () => {
        emailCalls += 1;
        return { configured: true, delivered: emailCalls > 1 ? 1 : 0, failed: emailCalls > 1 ? 0 : 1 };
      },
      push: async () => {
        pushCalls += 1;
        return { configured: true, delivered: 1, failed: 0 };
      },
    },
  };
  await drainNotificationOutbox(worker);
  assert.equal(state._notificationOutbox[0].channels.email.status, 'pending');
  assert.equal(state._notificationOutbox[0].channels.push.status, 'sent');
  assert.equal(pushCalls, 1);
  now += 120000;
  await drainNotificationOutbox(worker);
  assert.equal(emailCalls, 2);
  assert.equal(pushCalls, 1);
  assert.equal(state._notificationOutbox[0].channels.email.status, 'sent');
  assert.deepEqual(enqueueNotificationEvents(state, { ...state, _notificationOutbox: [] }, now), state._notificationOutbox);
});

test('revoked project access cancels queued delivery before contacting a provider', async () => {
  let state = fixture();
  state.projects[0].access = 'private';
  const neverSend = () => {
    throw new Error('Provider must not be called');
  };
  await drainNotificationOutbox({
    now: () => 100,
    load: async () => structuredClone(state),
    mutate: async change => {
      state = change(structuredClone(state));
      state.revision += 1;
      return structuredClone(state);
    },
    send: { email: neverSend, push: neverSend },
  });
  assert.equal(state._notificationOutbox[0].channels.email.status, 'skipped');
  assert.equal(state._notificationOutbox[0].channels.push.status, 'skipped');
});

test('a configured channel without an eligible destination is skipped, not retried forever', async () => {
  let state = fixture();
  const result = await drainNotificationOutbox({
    now: () => 100,
    load: async () => structuredClone(state),
    mutate: async change => {
      state = change(structuredClone(state));
      state.revision++;
      return state;
    },
    send: { email: async () => ({ configured: true, attempted: 0, failed: 0 }), push: async () => ({ configured: true, attempted: 0, failed: 0 }) },
  });
  assert.equal(result.failed, 0);
  assert.ok(Object.values(state._notificationOutbox[0].channels).every(channel => channel.status === 'skipped' && channel.reason === 'no_destination'));
});
