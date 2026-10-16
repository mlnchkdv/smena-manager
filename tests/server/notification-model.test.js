import assert from 'node:assert/strict';
import test from 'node:test';
import { migrateNotificationRecipients, notificationForMember, notificationsForMember } from '../../src/shared/notification-model.js';

const workspace = () => ({
  me: 'owner',
  members: [
    { id: 'owner', role: 'Owner' },
    { id: 'editor', role: 'Member' },
  ],
  notifs: [
    { id: 'owner-notification', recipient: 'owner', read: false },
    { id: 'editor-notification', recipient: 'editor', read: false },
  ],
});

test('workspace notifications are visible only to their recipient', () => {
  const data = workspace();

  assert.deepEqual(
    notificationsForMember(data, 'owner').map(notification => notification.id),
    ['owner-notification'],
  );
  assert.deepEqual(
    notificationsForMember(data, 'editor').map(notification => notification.id),
    ['editor-notification'],
  );
  assert.equal(notificationForMember(data, 'owner-notification', 'editor'), null);
});

test('legacy notifications are assigned to the stored current member', () => {
  const source = workspace();
  source.notifs = [{ id: 'legacy-notification', read: false }];

  const migrated = migrateNotificationRecipients(source);

  assert.equal(migrated.notifs[0].recipient, 'owner');
  assert.equal(source.notifs[0].recipient, undefined);
  assert.deepEqual(notificationsForMember(migrated, 'editor'), []);
});
