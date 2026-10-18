import assert from 'node:assert/strict';
import test from 'node:test';
import { sendOwnTestNotification } from '../../src/server/test-notification.js';

test('delivery test targets only the resolved member without modifying saved data', async () => {
  const data = {
    members: [
      { id: 'me', email: 'me@example.test' },
      { id: 'other', email: 'other@example.test' },
    ],
    notifPrefs: { me: { email_security: false } },
  };
  const before = structuredClone(data);
  let calls = 0;
  const result = await sendOwnTestNotification(data, data.members[0], 'email', {
    email: async (isolated, notifications) => {
      calls++;
      assert.deepEqual(
        isolated.members.map(member => member.id),
        ['me'],
      );
      assert.equal(isolated.notifPrefs.me.email_security, true);
      assert.equal(notifications.length, 1);
      assert.equal(notifications[0].recipient, 'me');
      assert.equal(notifications[0].type, 'system');
      return { attempted: 1, delivered: 1, failed: 0 };
    },
    push: () => assert.fail('must not send another channel'),
  });
  assert.equal(calls, 1);
  assert.equal(result.recipient, 'me@example.test');
  assert.equal(result.delivered, 1);
  assert.deepEqual(data, before);
});

test('push test reports missing subscriptions as zero attempts, not success', async () => {
  const result = await sendOwnTestNotification({}, { id: 'me', email: 'me@example.test', locale: 'en' }, 'push', {
    push: async (_data, notifications, options) => {
      assert.equal(options.locale, 'en');
      assert.match(notifications[0].text, /test notification/u);
      return { attempted: 0, delivered: 0, failed: 0 };
    },
  });
  assert.equal(result.delivered, 0);
  assert.equal(result.attempted, 0);
});

test('delivery tests reject unsupported channels and missing identity', async () => {
  await assert.rejects(sendOwnTestNotification({}, { id: 'me', email: 'me@example.test' }, 'all'), { statusCode: 400 });
  await assert.rejects(sendOwnTestNotification({}, null, 'email'), { statusCode: 403 });
});
