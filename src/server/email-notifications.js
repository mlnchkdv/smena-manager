import { OAuth2Client } from 'google-auth-library';
import { emailPreferenceForNotification, notificationPreferencesForMember } from '../shared/notification-model.js';
import { getWorkspaceDatabase, replaceWorkspaceDatabase, RevisionConflictError } from './workspace-store.js';

const ACTIONS = {
  en: {
    'assigned you': 'assigned you a task',
    'commented on': 'commented on your task',
    'mentioned you in': 'mentioned you',
    'mentioned your team in': 'mentioned your team',
    'mentioned everyone in': 'mentioned everyone',
    'is due tomorrow': 'is due tomorrow',
    'is overdue': 'is overdue',
  },
  ru: {
    'assigned you': 'назначил(а) вам задачу',
    'commented on': 'оставил(а) комментарий к вашей задаче',
    'mentioned you in': 'упомянул(а) вас',
    'mentioned your team in': 'упомянул(а) вашу команду',
    'mentioned everyone in': 'упомянул(а) всех',
    'is due tomorrow': 'срок завтра',
    'is overdue': 'срок просрочен',
  },
};

function configuredLocale(value = process.env.NOTIFICATION_LOCALE) {
  return String(value || 'ru').toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

export function emailDeliveryConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN?.trim();
  const from = process.env.EMAIL_FROM?.trim() || 'avdeevandry1999@gmail.com';
  return { enabled: Boolean(clientId && clientSecret && refreshToken && from), clientId, clientSecret, refreshToken, from };
}

function encodeHeader(value) {
  return `=?UTF-8?B?${Buffer.from(String(value)).toString('base64')}?=`;
}

export function createRawEmail({ from, to, subject, text }) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(to) || /[\r\n]/u.test(from) || /[\r\n]/u.test(to)) {
    throw new TypeError('A valid email recipient is required.');
  }
  const message = [
    `From: ${encodeHeader('Smena Manager')} <${from}>`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(text).toString('base64'),
  ].join('\r\n');
  return Buffer.from(message).toString('base64url');
}

async function gmailAccessToken(config) {
  const auth = new OAuth2Client(config.clientId, config.clientSecret);
  auth.setCredentials({ refresh_token: config.refreshToken });
  const result = await auth.getAccessToken();
  if (!result?.token) throw new Error('Google did not issue an email access token.');
  return result.token;
}

async function sendGmail(accessToken, message) {
  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: createRawEmail(message) }),
  });
  if (!response.ok) {
    const details = await response.json().catch(() => ({}));
    const error = new Error(`Gmail rejected the notification (${response.status}).`);
    error.statusCode = response.status;
    error.providerReason = details.error?.status || details.error?.message;
    throw error;
  }
  return response.json();
}

export function emailNotificationMessage(notification, data, locale = configuredLocale()) {
  const member = data.members?.find(item => item.id === notification.recipient);
  const actor = notification.by ? data.members?.find(item => item.id === notification.by)?.name : '';
  const task = notification.task ? data.tasks?.find(item => item.id === notification.task) : null;
  const action = ACTIONS[locale]?.[notification.text] || notification.text || (locale === 'ru' ? 'Новое уведомление' : 'New notification');
  const subject = actor ? `${actor}: ${action}` : task ? `${task.title}: ${action}` : action;
  const greeting = locale === 'ru' ? `Здравствуйте, ${member?.name || ''}!` : `Hello, ${member?.name || ''}!`;
  const open = locale === 'ru' ? 'Открыть Smena Manager' : 'Open Smena Manager';
  return {
    to: member?.email || '',
    subject: `[Smena Manager] ${subject}`,
    text: `${greeting}\n\n${subject}\n${notification.snippet || task?.title || ''}\n\n${open}: https://smena-manager.vercel.app/notifications`,
  };
}

export async function deliverEmailNotifications(data, notifications = [], options = {}) {
  const config = emailDeliveryConfig();
  if (!config.enabled || !notifications.length) return { delivered: 0 };
  const deliveries = notifications.filter(notification => {
    const preference = emailPreferenceForNotification(notification);
    return preference && notificationPreferencesForMember(data, notification.recipient)[preference] === true;
  });
  if (!deliveries.length) return { delivered: 0 };
  const accessToken = await gmailAccessToken(config);
  let delivered = 0;
  for (const notification of deliveries) {
    const message = emailNotificationMessage(notification, data, configuredLocale(options.locale));
    if (!message.to) continue;
    try {
      await sendGmail(accessToken, { ...message, from: config.from });
      delivered += 1;
    } catch (error) {
      console.error('[Email] Delivery failed:', error.providerReason || error.message);
    }
  }
  return { delivered };
}

function dateInTimeZone(value, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
  const part = type => parts.find(item => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function createDailyDigestPlan(data, options = {}) {
  const timeZone = options.timeZone || process.env.REMINDER_TIME_ZONE || 'Europe/Saratov';
  const now = options.now ? new Date(options.now) : new Date();
  const today = options.today || dateInTimeZone(now, timeZone);
  const weekday = options.weekday ?? new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(now);
  if (['Sat', 'Sun'].includes(weekday)) return { today, recipients: [] };
  const recipients = (data.members || [])
    .filter(member => member?.id && member.email && member.status !== 'deactivated')
    .filter(member => {
      const preferences = notificationPreferencesForMember(data, member.id);
      return preferences.email_digest === true && preferences.emailDigestLastDate !== today;
    });
  return { today, recipients };
}

export function dailyDigestMessage(data, member, today, locale = configuredLocale()) {
  const open = (data.tasks || []).filter(task => task.assignee === member.id && task.status !== 'done');
  const overdue = open.filter(task => task.due && String(task.due).slice(0, 10) < today).length;
  const dueToday = open.filter(task => String(task.due || '').slice(0, 10) === today).length;
  const lines =
    locale === 'ru'
      ? [`Открытых задач: ${open.length}`, `На сегодня: ${dueToday}`, `Просрочено: ${overdue}`]
      : [`Open tasks: ${open.length}`, `Due today: ${dueToday}`, `Overdue: ${overdue}`];
  return {
    to: member.email,
    subject: locale === 'ru' ? `[Smena Manager] Сводка за ${today}` : `[Smena Manager] Daily digest for ${today}`,
    text: `${locale === 'ru' ? `Здравствуйте, ${member.name}!` : `Hello, ${member.name}!`}\n\n${lines.join('\n')}\n\nhttps://smena-manager.vercel.app/mytasks`,
  };
}

export async function runDailyEmailDigest(options = {}) {
  const config = emailDeliveryConfig();
  if (!config.enabled) return { delivered: 0, skipped: 'disabled' };
  const current = await getWorkspaceDatabase();
  const plan = createDailyDigestPlan(current, options);
  if (!plan.recipients.length) return { delivered: 0, today: plan.today };
  const accessToken = await gmailAccessToken(config);
  const deliveredMembers = [];
  for (const member of plan.recipients) {
    try {
      await sendGmail(accessToken, { ...dailyDigestMessage(current, member, plan.today, configuredLocale(options.locale)), from: config.from });
      deliveredMembers.push(member.id);
    } catch (error) {
      console.error('[Email digest] Delivery failed:', error.providerReason || error.message);
    }
  }
  if (!deliveredMembers.length) return { delivered: 0, today: plan.today };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const latest = await getWorkspaceDatabase();
    try {
      await replaceWorkspaceDatabase(
        {
          ...latest,
          notifPrefs: {
            ...latest.notifPrefs,
            ...Object.fromEntries(
              deliveredMembers.map(memberId => [
                memberId,
                { ...notificationPreferencesForMember(latest, memberId), emailDigestLastDate: plan.today },
              ]),
            ),
          },
        },
        latest.revision,
        { role: 'admin' },
      );
      break;
    } catch (error) {
      if (!(error instanceof RevisionConflictError) || attempt === 2) throw error;
    }
  }
  return { delivered: deliveredMembers.length, today: plan.today };
}
