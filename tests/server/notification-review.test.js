import test from 'node:test';
import assert from 'node:assert/strict';
import { notificationDeliveryPaused, notificationReviewStatus, reviewNotificationQueue } from '../../src/server/notification-review.js';
import { drainNotificationOutbox } from '../../src/server/notification-outbox.js';

test('new VPS queues are paused; preview contains no message text and review requires the exact revision', async () => {
  const now = Date.parse('2026-11-12T12:00:00Z');
  const data = {
    revision: 3,
    members: [{ id: 'm', name: 'Member' }],
    _notificationOutbox: [
      { id: 'a', createdAt: now - 10 * 86400000, notification: { recipient: 'm', text: 'private body' }, channels: { email: { status: 'pending' } } },
    ],
  };
  const env = { NODE_ENV: 'production' };
  assert.equal(notificationDeliveryPaused(data, env), true);
  assert.equal(notificationDeliveryPaused(data, { ...env, VERCEL: '1' }), false);
  const review = notificationReviewStatus(data, env, now);
  assert.equal(review.olderThanWeek, 1);
  assert.equal(JSON.stringify(review).includes('private body'), false);
  assert.throws(() => reviewNotificationQueue(data, { action: 'resume', revision: 2 }, 'admin', now), { code: 'REVISION_CONFLICT' });
  const result = await drainNotificationOutbox({ env, load: async () => data, mutate: () => assert.fail('Paused queue must not claim'), send: {} });
  assert.equal(result.paused, true);
  reviewNotificationQueue(data, { action: 'resume', revision: 3 }, 'admin', now);
  assert.equal(notificationDeliveryPaused(data, env), false);
  data._notificationOutbox[0].channels.email.leaseUntil = now + 1;
  assert.throws(() => reviewNotificationQueue(data, { action: 'skip-before', revision: 3, cutoff: review.cutoff }, 'admin', now), /progress/);
  data._notificationOutbox[0].channels.email.leaseUntil = 0;
  reviewNotificationQueue(data, { action: 'skip-before', revision: 3, cutoff: review.cutoff }, 'admin', now);
  assert.equal(data._notificationOutbox[0].channels.email.status, 'skipped');
  assert.equal(data._notificationOutbox.length, 1);
});
