import { OAuth2Client } from 'google-auth-library';
import { configureProviderTimeout, reportProviderError } from './provider-safety.js';
import { emailPreferenceForNotification, notificationPreferencesForMember } from '../shared/notification-model.js';
import { notificationUrl } from '../shared/notification-links.js';
import { notificationAction, notificationLocale, notificationSnippet } from '../shared/notification-copy.js';
import { getWorkspaceDatabase, replaceWorkspaceDatabase, RevisionConflictError } from './workspace-store.js';

let authorizationCache = null;

function configuredLocale(value = process.env.NOTIFICATION_LOCALE) {
  return String(value || 'ru')
    .toLowerCase()
    .startsWith('ru')
    ? 'ru'
    : 'en';
}

export function emailDeliveryConfig() {
  const dedicatedRefreshToken = process.env.GMAIL_OAUTH_REFRESH_TOKEN?.trim();
  const clientId = process.env.GMAIL_OAUTH_CLIENT_ID?.trim() || process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GMAIL_OAUTH_CLIENT_SECRET?.trim() || process.env.GOOGLE_CLIENT_SECRET?.trim();
  const refreshToken = dedicatedRefreshToken || process.env.GOOGLE_REFRESH_TOKEN?.trim();
  const from = process.env.EMAIL_FROM?.trim() || 'avdeevandry1999@gmail.com';
  return {
    enabled: Boolean(clientId && clientSecret && refreshToken && from),
    credentialMode: dedicatedRefreshToken ? 'dedicated' : 'shared',
    clientId,
    clientSecret,
    refreshToken,
    from,
  };
}

export async function emailAuthorizationStatus() {
  const config = emailDeliveryConfig();
  const cacheKey = config.enabled ? `${config.clientId}:${config.from}:${config.credentialMode}` : 'disabled';
  if (authorizationCache?.key === cacheKey && authorizationCache.expiresAt > Date.now()) return authorizationCache.value;
  if (!config.enabled) {
    const value = { configured: false, authorized: false };
    authorizationCache = { key: cacheKey, expiresAt: Date.now() + 5 * 60_000, value };
    return value;
  }
  try {
    const auth = configureProviderTimeout(new OAuth2Client(config.clientId, config.clientSecret));
    auth.setCredentials({ refresh_token: config.refreshToken });
    const result = await auth.getAccessToken();
    if (!result?.token) {
      const value = { configured: true, authorized: false };
      authorizationCache = { key: cacheKey, expiresAt: Date.now() + 60_000, value };
      return value;
    }
    const info = await auth.getTokenInfo(result.token);
    const scopes = new Set(info.scopes || []);
    const value = {
      configured: true,
      authorized: scopes.has('https://www.googleapis.com/auth/gmail.send') || scopes.has('https://mail.google.com/'),
      credentialMode: config.credentialMode,
    };
    authorizationCache = { key: cacheKey, expiresAt: Date.now() + 5 * 60_000, value };
    return value;
  } catch {
    const value = { configured: true, authorized: false };
    authorizationCache = { key: cacheKey, expiresAt: Date.now() + 60_000, value };
    return value;
  }
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
  const auth = configureProviderTimeout(new OAuth2Client(config.clientId, config.clientSecret));
  auth.setCredentials({ refresh_token: config.refreshToken });
  const result = await auth.getAccessToken();
  if (!result?.token) throw new Error('Google did not issue an email access token.');
  return result.token;
}

async function sendGmail(accessToken, message) {
  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    signal: AbortSignal.timeout(15000),
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

const transientStatus = status => !status || status === 408 || status === 425 || status === 429 || status >= 500;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

export function emailNotificationMessage(notification, data, locale = notificationLocale(data, notification.recipient, configuredLocale())) {
  const member = data.members?.find(item => item.id === notification.recipient);
  const actor = notification.by ? data.members?.find(item => item.id === notification.by)?.name : '';
  const task = notification.task ? data.tasks?.find(item => item.id === notification.task) : null;
  const action = notificationAction(notification, locale) || (locale === 'ru' ? 'Новое уведомление' : 'New notification');
  const subject = actor ? `${actor}: ${action}` : task ? `${task.title}: ${action}` : action;
  const greeting = locale === 'ru' ? `Здравствуйте, ${member?.name || ''}!` : `Hello, ${member?.name || ''}!`;
  const open = locale === 'ru' ? 'Открыть Smena Manager' : 'Open Smena Manager';
  return {
    to: member?.email || '',
    subject: `[Smena Manager] ${subject}`,
    text: `${greeting}\n\n${subject}\n${notificationSnippet(notification, locale) || task?.title || ''}\n\n${open}: ${notificationUrl(data, notification)}`,
  };
}

export async function deliverEmailNotifications(data, notifications = [], options = {}) {
  const config = emailDeliveryConfig();
  if (!config.enabled || !notifications.length) {
    return { configured: config.enabled, attempted: 0, delivered: 0, failed: 0, retried: 0, removed: 0 };
  }
  const deliveries = notifications.filter(notification => {
    const preference = emailPreferenceForNotification(notification);
    return preference && notificationPreferencesForMember(data, notification.recipient)[preference] === true;
  });
  if (!deliveries.length) return { configured: true, attempted: 0, delivered: 0, failed: 0, retried: 0, removed: 0 };
  const messages = deliveries.map(notification => emailNotificationMessage(notification, data, options.locale)).filter(message => message.to);
  let accessToken;
  try {
    accessToken = options.accessToken || (await gmailAccessToken(config));
  } catch (error) {
    reportProviderError('[Email] Authorization failed', error);
    return { configured: true, attempted: messages.length, delivered: 0, failed: messages.length, retried: 0, removed: 0 };
  }
  const sender = options.send || sendGmail;
  let delivered = 0;
  let failed = 0;
  let retried = 0;
  for (const message of messages) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await sender(accessToken, { ...message, from: config.from });
        delivered += 1;
        break;
      } catch (error) {
        if (attempt === 0 && transientStatus(Number(error?.statusCode || error?.status || 0))) {
          retried += 1;
          await (options.wait || wait)(Number(options.retryDelayMs ?? 250));
          continue;
        }
        failed += 1;
        reportProviderError('[Email] Delivery failed', error);
      }
    }
  }
  return { configured: true, attempted: messages.length, delivered, failed, retried, removed: 0 };
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

export function dailyDigestMessage(data, member, today, locale = notificationLocale(data, member.id, configuredLocale())) {
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
    text: `${locale === 'ru' ? `Здравствуйте, ${member.name}!` : `Hello, ${member.name}!`}\n\n${lines.join('\n')}\n\n${notificationUrl(data, 'mytasks')}`,
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
      reportProviderError('[Email digest] Delivery failed', error);
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
              deliveredMembers.map(memberId => [memberId, { ...notificationPreferencesForMember(latest, memberId), emailDigestLastDate: plan.today }]),
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
