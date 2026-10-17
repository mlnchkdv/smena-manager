import assert from 'node:assert/strict';
import test from 'node:test';
import { drainNotificationOutbox, enqueueNotificationEvents } from '../../src/server/notification-outbox.js';

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
