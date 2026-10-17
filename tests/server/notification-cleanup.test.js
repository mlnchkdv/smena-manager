import assert from 'node:assert/strict';
import test from 'node:test';
import { pruneWorkspaceNotifications } from '../../src/server/notification-cleanup.js';

const DAY = 24 * 60 * 60 * 1000;

test('notification cleanup expires old read history but retains recent and unread items', () => {
  const now = Date.UTC(2026, 9, 16);
  const data = {
    me: 'member',
    members: [{ id: 'member' }],
    notifs: [
      { id: 'recent-read', recipient: 'member', read: true, at: now - 10 * DAY },
      { id: 'old-read', recipient: 'member', read: true, at: now - 91 * DAY },
      { id: 'old-unread', recipient: 'member', read: false, at: now - 91 * DAY },
      { id: 'expired-unread', recipient: 'member', read: false, at: now - 366 * DAY },
    ],
  };
  const result = pruneWorkspaceNotifications(data, { now });
  assert.equal(result.removed, 2);
  assert.deepEqual(
    result.data.notifs.map(item => item.id),
    ['recent-read', 'old-unread'],
  );
  assert.equal(data.notifs.length, 4);
});

test('notification cleanup enforces a bounded history per recipient', () => {
  const now = Date.UTC(2026, 9, 16);
  const data = {
    me: 'member',
    members: [{ id: 'member' }],
    notifs: Array.from({ length: 55 }, (_, index) => ({
      id: `notification-${index}`,
      recipient: 'member',
      read: false,
      at: now - index,
    })),
  };
  const result = pruneWorkspaceNotifications(data, { now, maxPerMember: 50 });
  assert.equal(result.removed, 5);
  assert.equal(result.data.notifs.length, 50);
  assert.equal(result.data.notifs[0].id, 'notification-0');
});
