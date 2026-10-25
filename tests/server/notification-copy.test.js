import assert from 'node:assert/strict';
import test from 'node:test';
import { notificationAction, notificationLocale, notificationSnippet } from '../../src/shared/notification-copy.js';
import { emailNotificationMessage } from '../../src/server/email-notifications.js';
import { pushMessagePayload } from '../../src/server/push-subscriptions.js';
import { inboxEventGroups } from '../../src/shared/inbox-groups.js';

test('inbox groups only identical system events without losing unread rows or chronology', () => {
  const rows = [
    { id: 'new', type: 'system', text: 'warning', snippet: 'a', read: false },
    { id: 'comment', type: 'comment', text: 'warning', snippet: 'a' },
    { id: 'old', type: 'system', text: 'warning', snippet: 'a', read: false },
    { id: 'different', type: 'system', text: 'warning', snippet: 'b' },
  ];
  const groups = inboxEventGroups(rows);
  assert.deepEqual(
    groups.map(row => row.notification.id),
    ['new', 'comment', 'different'],
  );
  assert.deepEqual(
    groups[0].earlier.map(row => row.id),
    ['old'],
  );
  assert.equal(groups.flatMap(row => [row.notification, ...row.earlier]).length, rows.length);
  assert.equal(rows[2].read, false);
});

test('historical system issue codes localize without translating comments or unknown diagnostics', () => {
  const event = {
    type: 'system',
    by: null,
    text: 'System check needs attention',
    snippet: 'Notification delivery failed · Automatic backup failed · Custom diagnostic',
  };
  assert.equal(notificationSnippet(event, 'ru'), 'Не удалось доставить уведомления · Не удалось создать автоматическую копию · Custom diagnostic');
  assert.equal(notificationSnippet(event, 'en'), event.snippet);
  assert.equal(notificationSnippet({ ...event, type: 'comment' }, 'ru'), event.snippet);
  assert.equal(notificationSnippet({ ...event, by: 'member' }, 'ru'), event.snippet);
});

test('notification channels use recipient language, localize system statuses and preserve user content', () => {
  const data = {
    ws: { url: 'team' },
    members: [
      { id: 'ru', name: 'Review', locale: 'ru', email: 'ru@example.test' },
      { id: 'en', locale: 'en' },
    ],
    tasks: [{ id: 't', title: 'Done' }],
  };
  const notification = { id: 'n', recipient: 'ru', task: 't', type: 'update', text: 'moved to Review', snippet: 'To do → Review' };
  assert.equal(notificationLocale(data, 'ru'), 'ru');
  assert.equal(notificationLocale(data, 'en', 'ru'), 'en');
  assert.match(notificationAction(notification, 'ru'), /На проверке/u);
  assert.equal(notificationSnippet(notification, 'ru'), 'К выполнению → На проверке');
  assert.equal(notificationSnippet({ type: 'comment', snippet: 'Review' }, 'ru'), 'Review');
  assert.equal(notificationSnippet({ type: 'update', project: 'p', text: 'updated milestone in', snippet: 'Review' }, 'ru'), 'Review');
  const email = emailNotificationMessage(notification, data);
  assert.match(email.text, /Здравствуйте, Review!/u);
  assert.match(email.text, /\/team\/task\/t/u);
  assert.match(pushMessagePayload(notification, data).title, /На проверке/u);
  assert.equal(pushMessagePayload(notification, data).url, '/team/task/t');
});
