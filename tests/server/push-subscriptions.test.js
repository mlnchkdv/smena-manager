import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePushSubscription, pushMessagePayload } from '../../src/server/push-subscriptions.js';

const subscription = {
  endpoint: 'https://push.example.test/subscription/1',
  expirationTime: null,
  keys: { p256dh: 'public-key', auth: 'auth-key' },
};

test('push subscriptions require a bounded HTTPS endpoint and browser keys', () => {
  assert.deepEqual(normalizePushSubscription(subscription), subscription);
  assert.throws(() => normalizePushSubscription({ ...subscription, endpoint: 'http://push.example.test/1' }), /invalid/i);
  assert.throws(() => normalizePushSubscription({ endpoint: 'https://push.example.test/1', keys: {} }), /invalid/i);
});

test('push payloads are localized without exposing workspace data', () => {
  const data = {
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
});
