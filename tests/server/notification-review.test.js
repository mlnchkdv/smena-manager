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
  const env = { NODE_ENV: 'production', APP_ORIGIN: 'https://new.team.invalid' };
  assert.equal(notificationDeliveryPaused(data, env), true);
  assert.equal(notificationDeliveryPaused(data, { ...env, VERCEL: '1' }), false);
  const review = notificationReviewStatus(data, env, now);
  assert.equal(review.olderThanWeek, 1);
  assert.equal(JSON.stringify(review).includes('private body'), false);
  assert.throws(() => reviewNotificationQueue(data, { action: 'resume', revision: 2 }, 'admin', now), { code: 'REVISION_CONFLICT' });
  const result = await drainNotificationOutbox({ env, load: async () => data, mutate: () => assert.fail('Paused queue must not claim'), send: {} });
  assert.equal(result.paused, true);
  reviewNotificationQueue(data, { action: 'resume', revision: 3 }, 'admin', now, env);
  assert.equal(notificationDeliveryPaused(data, env), false);
  assert.equal(notificationDeliveryPaused(data, { ...env, APP_ORIGIN: 'https://other.team.invalid' }), true);
  data._notificationOutbox[0].channels.email.leaseUntil = now + 1;
  assert.throws(() => reviewNotificationQueue(data, { action: 'skip-before', revision: 3, cutoff: review.cutoff }, 'admin', now), /progress/);
  data._notificationOutbox[0].channels.email.leaseUntil = 0;
  reviewNotificationQueue(data, { action: 'skip-before', revision: 3, cutoff: review.cutoff }, 'admin', now);
  assert.equal(data._notificationOutbox[0].channels.email.status, 'skipped');
  assert.equal(data._notificationOutbox.length, 1);
});

test('recipient preview includes jobs after the entry limit; oversized recipient sets cannot be enabled', () => {
  const data = {
    revision: 1,
    _notificationOutbox: Array.from({ length: 75 }, (_, i) => ({
      id: 'n' + i,
      createdAt: i + 1,
      notification: { recipient: i < 60 ? 'a' : 'b' },
      channels: { email: { status: 'pending' } },
    })),
  };
  const review = notificationReviewStatus(data, { NODE_ENV: 'test' });
  assert.equal(review.preview.length, 50);
  assert.deepEqual(
    review.recipients.map(group => [group.recipient, group.jobs]),
    [
      ['a', 60],
      ['b', 15],
    ],
  );
  for (let i = 0; i < 101; i++) data._notificationOutbox.push({ notification: { recipient: 'r' + i }, channels: { push: { status: 'pending' } } });
  assert.equal(notificationReviewStatus(data).resumeAllowed, false);
  assert.throws(() => reviewNotificationQueue(data, { action: 'resume', revision: 1 }, 'admin'), /100 recipients/);
});
