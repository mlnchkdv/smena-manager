import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDailyDigestPlan,
  createRawEmail,
  dailyDigestMessage,
  emailNotificationMessage,
} from '../../src/server/email-notifications.js';

const workspace = {
  members: [
    { id: 'actor', name: 'Alex', email: 'alex@example.com', status: 'active' },
    { id: 'member', name: 'Полина', email: 'polina@example.com', status: 'active' },
  ],
  tasks: [
    { id: 'task-1', title: 'Проверить макет', assignee: 'member', status: 'todo', due: '2026-10-16' },
    { id: 'task-2', title: 'Исправить API', assignee: 'member', status: 'progress', due: '2026-10-14' },
  ],
  notifPrefs: { member: { email_digest: true } },
};

test('notification email content supports Russian and English', () => {
  const notification = {
    id: 'notification-1',
    recipient: 'member',
    by: 'actor',
    task: 'task-1',
    text: 'mentioned you in',
    snippet: 'Посмотри комментарий',
  };
  const english = emailNotificationMessage(notification, workspace, 'en');
  const russian = emailNotificationMessage(notification, workspace, 'ru');
  assert.equal(english.to, 'polina@example.com');
  assert.match(english.subject, /mentioned you/u);
  assert.match(russian.subject, /упомянул/u);
  assert.match(russian.text, /Здравствуйте, Полина/u);
});

test('raw Gmail messages encode Unicode and reject header injection', () => {
  const raw = createRawEmail({
    from: 'sender@example.com',
    to: 'member@example.com',
    subject: 'Новая задача',
    text: 'Проверьте макет',
  });
  const decoded = Buffer.from(raw, 'base64url').toString('utf8');
  assert.match(decoded, /Content-Type: text\/plain; charset=UTF-8/u);
  assert.match(decoded, /Subject: =\?UTF-8\?B\?/u);
  assert.throws(
    () => createRawEmail({ from: 'sender@example.com', to: 'member@example.com\r\nBcc: attacker@example.com', subject: 'x', text: 'x' }),
    /valid email/u,
  );
});

test('weekday digest is idempotent per member and reports task deadlines in both languages', () => {
  const plan = createDailyDigestPlan(workspace, { today: '2026-10-16', weekday: 'Fri' });
  assert.deepEqual(plan.recipients.map(member => member.id), ['member']);
  assert.match(dailyDigestMessage(workspace, plan.recipients[0], plan.today, 'ru').text, /Просрочено: 1/u);
  assert.match(dailyDigestMessage(workspace, plan.recipients[0], plan.today, 'en').text, /Due today: 1/u);

  const sent = structuredClone(workspace);
  sent.notifPrefs.member.emailDigestLastDate = '2026-10-16';
  assert.equal(createDailyDigestPlan(sent, { today: '2026-10-16', weekday: 'Fri' }).recipients.length, 0);
  assert.equal(createDailyDigestPlan(workspace, { today: '2026-10-17', weekday: 'Sat' }).recipients.length, 0);
});
