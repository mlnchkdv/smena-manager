import { addWorkspaceNotification } from '../shared/notification-model.js';
import { getWorkspaceDatabase, replaceWorkspaceDatabase, RevisionConflictError } from './workspace-store.js';
import { deliverWorkspaceNotifications } from './notification-delivery.js';
import { calendarDate } from '../shared/calendar-time.js';

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
  if (due === today) return 'today';
  if (due < today) return 'overdue';
  return null;
}

export function createDueReminders(value, options = {}) {
  const data = structuredClone(value);
  if (!Array.isArray(data.notifs)) data.notifs = [];
  const today = options.today || dateInTimeZone(options.now ? new Date(options.now) : new Date(), options.timeZone);
  const now = Number(options.now || Date.now());
  const activeMembers = new Set(
    (data.members || []).filter(member => member?.id && !['deactivated', 'removed'].includes(member.status)).map(member => member.id),
  );
  const archivedProjects = new Set((data.projects || []).filter(project => project.archived).map(project => project.id));
  const existing = new Set(data.notifs.map(item => item.id));
  const activeTasks = new Map((data.tasks || []).filter(task => !task.archived && task.status !== 'done').map(task => [task.id, task]));
  const history = (data._reminderHistory || []).filter(item => {
    const task = activeTasks.get(item.task);
    return task && task.assignee === item.assignee && String(task.due || '').slice(0, 10) === item.due;
  });
  const remembered = new Set(history.map(item => item.id));
  // Keep delivery identity separately from inbox retention, including legacy events.
  for (const notification of data.notifs)
    if (notification.type === 'due' && notification.reminder && activeTasks.has(notification.task) && !remembered.has(notification.id)) {
      history.push({
        id: notification.id,
        task: notification.task,
        assignee: notification.recipient,
        due: notification.due,
        kind: notification.reminder,
        at: notification.at,
      });
      remembered.add(notification.id);
    }
  const created = [];

  for (const task of data.tasks || []) {
    if (!task?.id || task.archived || archivedProjects.has(task.project) || !task.assignee || !activeMembers.has(task.assignee) || task.status === 'done')
      continue;
    const due = String(task.due || '').slice(0, 10);
    const memberZone = data.members.find(member => member.id === task.assignee)?.timeZone;
    const recipientToday = options.today || calendarDate(new Date(now), memberZone || options.timeZone || process.env.REMINDER_TIME_ZONE || DEFAULT_TIME_ZONE);
    const kind = reminderKind(due, recipientToday);
    if (!kind) continue;
    const id = `n-due-${kind}-${due}-${task.id}-${task.assignee}`;
    if (existing.has(id) || remembered.has(id)) continue;
    const notification = addWorkspaceNotification(data, {
      id,
      recipient: task.assignee,
      by: null,
      type: 'due',
      task: task.id,
      text: kind === 'tomorrow' ? 'is due tomorrow' : kind === 'today' ? 'is due today' : 'is overdue',
      snippet: task.title || 'Task deadline',
      due,
      reminder: kind,
      at: now,
    });
    if (notification && notification.at === now) {
      created.push(notification);
      history.push({ id, task: task.id, assignee: task.assignee, due, kind, at: now });
      remembered.add(id);
    }
  }

  const historyChanged = JSON.stringify(data._reminderHistory || []) !== JSON.stringify(history);
  data._reminderHistory = history;
  return { data, created, today, historyChanged };
}

export async function runDueReminderSweep(options = {}) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await getWorkspaceDatabase();
    const result = createDueReminders(current, options);
    if (!result.created.length && !result.historyChanged) return { created: 0, revision: current.revision, today: result.today };
    try {
      const saved = await replaceWorkspaceDatabase(result.data, current.revision, { role: 'admin' });
      const delivery = options.enqueueOnly ? { deferred: true } : await deliverWorkspaceNotifications(saved, result.created, { source: 'cron-reminders' });
      return { created: result.created.length, revision: saved.revision, today: result.today, delivery };
    } catch (error) {
      if (!(error instanceof RevisionConflictError) || attempt === 2) throw error;
    }
  }
  throw new Error('Due reminder sweep could not acquire the current workspace revision.');
}
