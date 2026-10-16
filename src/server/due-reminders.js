import { addWorkspaceNotification } from '../shared/notification-model.js';
import { getWorkspaceDatabase, replaceWorkspaceDatabase, RevisionConflictError } from './workspace-store.js';
import { deliverPushNotifications } from './push-subscriptions.js';

const DEFAULT_TIME_ZONE = 'Europe/Saratov';

export function dateInTimeZone(value = new Date(), timeZone = process.env.REMINDER_TIME_ZONE || DEFAULT_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const part = type => parts.find(item => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function nextDate(date) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

function reminderKind(due, today) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(due)) return null;
  if (due === nextDate(today)) return 'tomorrow';
  if (due < today) return 'overdue';
  return null;
}

export function createDueReminders(value, options = {}) {
  const data = structuredClone(value);
  if (!Array.isArray(data.notifs)) data.notifs = [];
  const today = options.today || dateInTimeZone(options.now ? new Date(options.now) : new Date(), options.timeZone);
  const now = Number(options.now || Date.now());
  const activeMembers = new Set(
    (data.members || []).filter(member => member?.id && member.status !== 'deactivated').map(member => member.id),
  );
  const created = [];

  for (const task of data.tasks || []) {
    if (!task?.id || !task.assignee || !activeMembers.has(task.assignee) || task.status === 'done') continue;
    const due = String(task.due || '').slice(0, 10);
    const kind = reminderKind(due, today);
    if (!kind) continue;
    const notification = addWorkspaceNotification(data, {
      id: `n-due-${kind}-${due}-${task.id}-${task.assignee}`,
      recipient: task.assignee,
      by: null,
      type: 'due',
      task: task.id,
      text: kind === 'tomorrow' ? 'is due tomorrow' : 'is overdue',
      snippet: task.title || 'Task deadline',
      due,
      reminder: kind,
      at: now,
    });
    if (notification && notification.at === now) created.push(notification);
  }

  return { data, created, today };
}

export async function runDueReminderSweep(options = {}) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await getWorkspaceDatabase();
    const result = createDueReminders(current, options);
    if (!result.created.length) return { created: 0, revision: current.revision, today: result.today };
    try {
      const saved = await replaceWorkspaceDatabase(result.data, current.revision, { role: 'admin' });
      await deliverPushNotifications(saved, result.created);
      return { created: result.created.length, revision: saved.revision, today: result.today };
    } catch (error) {
      if (!(error instanceof RevisionConflictError) || attempt === 2) throw error;
    }
  }
  throw new Error('Due reminder sweep could not acquire the current workspace revision.');
}
