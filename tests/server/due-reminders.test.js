import assert from 'node:assert/strict';
import test from 'node:test';
import { createDueReminders, dateInTimeZone } from '../../src/server/due-reminders.js';

function workspace() {
  return {
    me: 'admin',
    members: [
      { id: 'admin', name: 'Admin', status: 'active' },
      { id: 'member', name: 'Member', status: 'active' },
      { id: 'disabled', name: 'Disabled', status: 'deactivated' },
    ],
    tasks: [
      { id: 'tomorrow', title: 'Tomorrow task', assignee: 'member', status: 'todo', due: '2026-10-17' },
      { id: 'late', title: 'Late task', assignee: 'member', status: 'progress', due: '2026-10-14' },
      { id: 'done', title: 'Done task', assignee: 'member', status: 'done', due: '2026-10-14' },
      { id: 'disabled-task', title: 'Disabled task', assignee: 'disabled', status: 'todo', due: '2026-10-14' },
    ],
    notifs: [],
    notifPrefs: {},
  };
}

test('today deadlines notify once, while archived tasks and removed members never notify', () => {
  const data = workspace();
  data.tasks.push({ id: 'today', assignee: 'member', status: 'todo', due: '2026-10-16' });
  data.tasks[0].archived = true;
  data.members.find(member => member.id === 'disabled').status = 'removed';
  const first = createDueReminders(data, { today: '2026-10-16', now: 1000 });
  assert.deepEqual(
    first.created.map(item => item.task),
    ['late', 'today'],
  );
  const second = createDueReminders(first.data, { today: '2026-10-16', now: 1000 });
  assert.equal(second.created.length, 0);
});

test('due reminder sweep creates one trusted reminder per relevant task', () => {
  const first = createDueReminders(workspace(), { today: '2026-10-16', now: 1000 });
  assert.equal(first.created.length, 2);
  assert.deepEqual(
    first.created.map(item => [item.task, item.recipient, item.by, item.text]),
    [
      ['tomorrow', 'member', null, 'is due tomorrow'],
      ['late', 'member', null, 'is overdue'],
    ],
  );

  const second = createDueReminders(first.data, { today: '2026-10-16', now: 2000 });
  assert.equal(second.created.length, 0);
  assert.equal(second.data.notifs.length, 2);
});

test('overdue preference disables automated due reminders for that member', () => {
  const data = workspace();
  data.notifPrefs.member = { assign_over: false };
  const result = createDueReminders(data, { today: '2026-10-16', now: 1000 });
  assert.equal(result.created.length, 0);
});

test('inbox cleanup does not recreate already delivered overdue reminders', () => {
  const first = createDueReminders(workspace(), { today: '2026-10-16', now: 1000 });
  first.data.notifs = [];
  const second = createDueReminders(first.data, { today: '2026-10-16', now: 2000 });
  assert.equal(second.created.length, 0);
  second.data.tasks.find(task => task.id === 'late').due = '2026-10-13';
  assert.equal(createDueReminders(second.data, { today: '2026-10-16', now: 3000 }).created.length, 1);
});

test('reminder dates use the configured workspace time zone', () => {
  assert.equal(dateInTimeZone(new Date('2026-10-15T23:30:00.000Z'), 'Europe/Saratov'), '2026-10-16');
  assert.equal(dateInTimeZone(new Date('2026-10-15T23:30:00.000Z'), 'UTC'), '2026-10-15');
});

test('due reminder messages remain English keys and render in Russian', async () => {
  globalThis.document ||= { querySelectorAll: () => [] };
  globalThis.navigator ||= { platform: 'test', userAgent: 'test' };
  const { t } = await import('../../src/core/i18n.js');
  const { S } = await import('../../src/core/store.js');
  const previousLanguage = S.prefs.lang;
  S.prefs.lang = 'English (US)';
  assert.equal(t('Alex: Guest → Member'), 'Alex: Guest → Member');
  assert.equal(t('is due tomorrow'), 'is due tomorrow');
  assert.equal(t('is overdue'), 'is overdue');
  S.prefs.lang = 'Русский';
  assert.equal(t('Alex: Guest → Member'), 'Alex: Гость → Участник');
  assert.equal(t('is due tomorrow'), '— срок завтра');
  assert.equal(t('is overdue'), '— срок просрочен');
  S.prefs.lang = previousLanguage;
});
