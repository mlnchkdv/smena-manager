import assert from 'node:assert/strict';
import test from 'node:test';
import { notificationAction, notificationLocale, notificationSnippet } from '../../src/shared/notification-copy.js';
import { emailNotificationMessage } from '../../src/server/email-notifications.js';
import { pushMessagePayload } from '../../src/server/push-subscriptions.js';

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
