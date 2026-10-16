import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePushSubscription, prunePushSubscriptions, pushMessagePayload } from '../../src/server/push-subscriptions.js';

const p256dh = Buffer.concat([Buffer.from([0x04]), Buffer.alloc(64, 7)]).toString('base64url');
const auth = Buffer.alloc(16, 9).toString('base64url');

const subscription = {
  endpoint: 'https://push.example.test/subscription/1',
  expirationTime: null,
  keys: { p256dh, auth },
};

test('push subscriptions require a bounded HTTPS endpoint and browser keys', () => {
  assert.deepEqual(normalizePushSubscription(subscription), subscription);
  assert.throws(() => normalizePushSubscription({ ...subscription, endpoint: 'http://push.example.test/1' }), /invalid/i);
  assert.throws(() => normalizePushSubscription({ endpoint: 'https://push.example.test/1', keys: {} }), /invalid/i);
  assert.throws(() => normalizePushSubscription({ ...subscription, endpoint: 'https://127.0.0.1/push' }), /invalid/i);
  assert.throws(() => normalizePushSubscription({ ...subscription, keys: { p256dh: 'not-a-browser-key', auth } }), /invalid/i);
});

test('expired and abandoned push registrations are pruned without removing current devices', () => {
  const now = Date.parse('2026-10-17T00:00:00.000Z');
  const items = [
    { id: 'active', updatedAt: '2026-10-16T00:00:00.000Z', subscription: { expirationTime: null } },
    { id: 'expired', updatedAt: '2026-10-16T00:00:00.000Z', subscription: { expirationTime: now - 1 } },
    { id: 'abandoned', updatedAt: '2026-01-01T00:00:00.000Z', subscription: { expirationTime: null } },
  ];
  const result = prunePushSubscriptions(items, { now });
  assert.deepEqual(
    result.items.map(item => item.id),
    ['active'],
  );
  assert.deepEqual(result.removedIds, ['expired', 'abandoned']);
});

test('push payloads are localized without exposing workspace data', () => {
  const data = {
    ws: { url: 'команда-смена' },
    members: [{ id: 'actor', name: 'Alex' }],
    tasks: [{ id: 'task-1', title: 'Проверить макет' }],
  };
  const notification = {
    id: 'notification-1',
    recipient: 'member',
    by: 'actor',
    task: 'task-1',
    text: 'mentioned you in',
    snippet: 'Посмотри комментарий',
  };

  assert.equal(pushMessagePayload(notification, data, 'en').title, 'Alex: mentioned you in');
  assert.equal(pushMessagePayload(notification, data, 'ru').title, 'Alex: упомянул(а) вас');
  assert.deepEqual(Object.keys(pushMessagePayload(notification, data, 'ru')).sort(), ['badge', 'body', 'icon', 'tag', 'title', 'url']);
  assert.equal(pushMessagePayload(notification, data, 'ru').url, '/%D0%BA%D0%BE%D0%BC%D0%B0%D0%BD%D0%B4%D0%B0-%D1%81%D0%BC%D0%B5%D0%BD%D0%B0/notifications');
});
