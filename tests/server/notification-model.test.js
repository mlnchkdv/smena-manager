import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addWorkspaceNotification,
  migrateNotificationRecipients,
  mentionedMemberIds,
  notificationForMember,
  notificationPreferencesForMember,
  notificationsForMember,
  setNotificationPreference,
} from '../../src/shared/notification-model.js';

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

test('new notifications require another valid workspace member as recipient', () => {
  const data = workspace();
  const created = addWorkspaceNotification(data, {
    id: 'new-notification',
    recipient: 'editor',
    by: 'owner',
    type: 'assign',
    text: 'assigned you',
    at: 123,
  });

  assert.equal(created?.recipient, 'editor');
  assert.equal(created?.read, false);
  assert.equal(data.notifs[0].id, 'new-notification');
  assert.equal(addWorkspaceNotification(data, { id: 'self', recipient: 'owner', by: 'owner' }), null);
  assert.equal(addWorkspaceNotification(data, { id: 'unknown', recipient: 'missing', by: 'owner' }), null);
});

test('mentions resolve full member names without partial matches', () => {
  const members = [
    { id: 'alex', name: 'Alex Alyoshin' },
    { id: 'polina', name: 'Polina Grischenko' },
  ];

  assert.deepEqual(mentionedMemberIds('Проверь, пожалуйста, @Alex Alyoshin. Затем @Polina Grischenko!', members), ['alex', 'polina']);
  assert.deepEqual(mentionedMemberIds('Это не упоминание @Alex', members), []);
});

test('notification preferences are migrated and applied per recipient', () => {
  const source = workspace();
  source.notifPrefs = { assign_self: false, mention_all: true };
  const migrated = migrateNotificationRecipients(source);

  assert.equal(notificationPreferencesForMember(migrated, 'owner').assign_self, false);
  assert.equal(notificationPreferencesForMember(migrated, 'editor').assign_self, true);
  assert.equal(
    addWorkspaceNotification(migrated, {
      id: 'disabled-assignment',
      recipient: 'owner',
      by: 'editor',
      type: 'assign',
    }),
    null,
  );

  assert.equal(setNotificationPreference(migrated, 'editor', 'mention_all', false), true);
  assert.equal(notificationPreferencesForMember(migrated, 'editor').mention_all, false);
  assert.equal(setNotificationPreference(migrated, 'editor', 'unknown_preference', false), false);
});
