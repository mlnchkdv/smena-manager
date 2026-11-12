import test from 'node:test';
import assert from 'node:assert/strict';
import webpush from 'web-push';
import { pushRegistrationContext, pushRegistrationMatches } from '../../src/server/push-registration-context.js';
import { deliverPushNotifications } from '../../src/server/push-subscriptions.js';
import { drainNotificationOutbox } from '../../src/server/notification-outbox.js';

const keys = webpush.generateVAPIDKeys();
const env = {
  NODE_ENV: 'production',
  APP_ORIGIN: 'https://tasks.team.invalid',
  VAPID_PUBLIC_KEY: keys.publicKey,
  VAPID_PRIVATE_KEY: keys.privateKey,
  VAPID_SUBJECT: 'mailto:admin@team.invalid',
};
const context = pushRegistrationContext(env);
const subscription = id => ({
  endpoint: `https://fcm.googleapis.com/subscription/${id}`,
  expirationTime: null,
  keys: { p256dh: Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 7)]).toString('base64url'), auth: Buffer.alloc(16, 9).toString('base64url') },
});

test('VPS push accepts only registrations bound to its origin and public key; legacy records are retained', async () => {
  assert.throws(() => pushRegistrationContext(env, 'https://other.team.invalid'), /origin/);
  assert.throws(() => pushRegistrationContext({ ...env, APP_ORIGIN: 'http://tasks.team.invalid' }));
  assert.equal(pushRegistrationMatches({}, context), false);
  assert.equal(pushRegistrationMatches({ ...context, vapidKeyId: 'old-key' }, context), false);
  assert.equal(pushRegistrationMatches({ ...context, origin: 'https://old.team.invalid' }, context), false);
  const records = [
    { id: 'current', memberId: 'm', subscription: subscription('current'), ...context },
    { id: 'legacy', memberId: 'm', subscription: subscription('legacy') },
    { id: 'old-key', memberId: 'm', subscription: subscription('old-key'), ...context, vapidKeyId: 'old-key' },
    { id: 'old-origin', memberId: 'm', subscription: subscription('old-origin'), ...context, origin: 'https://old.team.invalid' },
  ];
  const before = structuredClone(records),
    sent = [];
  const result = await deliverPushNotifications(
    { members: [{ id: 'm' }], notifPrefs: { m: { push_mention: true } } },
    [{ id: 'n', type: 'mention', recipient: 'm' }],
    {
      env,
      storage: { loadPushSubscriptions: async () => records },
      send: async value => sent.push(value.endpoint),
    },
  );
  assert.equal(result.delivered, 1);
  assert.deepEqual(result.deliveredIds, ['current']);
  assert.deepEqual(sent, [subscription('current').endpoint]);
  assert.deepEqual(records, before);
});

test('partial push delivery persists per-device acknowledgements and does not resend a successful device on retry', async () => {
  let now = 100,
    attempts = 0;
  let state = {
    revision: 1,
    members: [{ id: 'm', role: 'Member' }],
    notifPrefs: { m: { push_mention: true } },
    _notificationOutbox: [
      { id: 'n', createdAt: 1, notification: { id: 'n', recipient: 'm', type: 'mention' }, channels: { push: { status: 'pending', attempts: 0, nextAt: 0 } } },
    ],
  };
  const seen = [];
  const worker = {
    now: () => now,
    load: async () => structuredClone(state),
    mutate: async (change, revision) => {
      assert.equal(revision, state.revision);
      state = change(structuredClone(state));
      state.revision++;
      return structuredClone(state);
    },
    send: {
      push: async (_data, _events, options) => {
        attempts++;
        seen.push(options.skipIds);
        return attempts === 1
          ? { configured: true, attempted: 2, delivered: 1, failed: 1, deliveredIds: ['deviceA'] }
          : { configured: true, attempted: 1, delivered: 1, failed: 0, deliveredIds: ['deviceB'] };
      },
    },
  };
  await drainNotificationOutbox(worker);
  assert.deepEqual(state._notificationOutbox[0].channels.push.deliveredTo, ['deviceA']);
  assert.equal(state._notificationOutbox[0].channels.push.status, 'pending');
  now += 120000;
  await drainNotificationOutbox(worker);
  assert.deepEqual(seen, [[], ['deviceA']]);
  assert.deepEqual(state._notificationOutbox[0].channels.push.deliveredTo, ['deviceA', 'deviceB']);
  assert.equal(state._notificationOutbox[0].channels.push.status, 'sent');
  await drainNotificationOutbox(worker);
  assert.equal(attempts, 2);
});

test('device progress skips provider calls only for the same single notification', async () => {
  const records = [{ id: 'current', memberId: 'm', subscription: subscription('current'), ...context }];
  const data = { notifPrefs: { m: { push_mention: true } } },
    note = { id: 'n', type: 'mention', recipient: 'm' };
  const options = {
    env,
    storage: { loadPushSubscriptions: async () => records },
    skipIds: ['current'],
    send: () => {
      throw Error('Already acknowledged device must not be sent again');
    },
  };
  assert.equal((await deliverPushNotifications(data, [note], options)).attempted, 0);
  await assert.rejects(deliverPushNotifications(data, [note, { ...note, id: 'n2' }], options), /one notification/);
});
