import crypto from 'node:crypto';
import net from 'node:net';
import webpush from 'web-push';
import { getStorageProvider } from './storage/index.js';
import { notificationPreferencesForMember, pushPreferenceForNotification } from '../shared/notification-model.js';
import { notificationPath } from '../shared/notification-links.js';

let mutationQueue = Promise.resolve();
const DAY_MS = 24 * 60 * 60 * 1000;
const BASE64URL = /^[A-Za-z0-9_-]+$/u;

function pushConfig() {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() || 'mailto:avdeevandry1999@gmail.com';
  return { enabled: Boolean(publicKey && privateKey), publicKey: publicKey || '', privateKey: privateKey || '', subject };
}

export function publicPushConfig() {
  const config = pushConfig();
  return { enabled: config.enabled, publicKey: config.enabled ? config.publicKey : '' };
}

export function normalizePushSubscription(value) {
  const endpoint = String(value?.endpoint || '').trim();
  const p256dh = String(value?.keys?.p256dh || '').trim();
  const auth = String(value?.keys?.auth || '').trim();
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    throw new TypeError('A valid push subscription endpoint is required.');
  }
  const expirationTime = value.expirationTime == null ? null : Number(value.expirationTime);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    endpoint.length > 2048 ||
    !publicEndpointHost(url.hostname) ||
    !validBrowserKey(p256dh, 65, 0x04) ||
    !validBrowserKey(auth, 16) ||
    (expirationTime !== null && (!Number.isFinite(expirationTime) || expirationTime <= 0))
  ) {
    throw new TypeError('The push subscription is invalid.');
  }
  return { endpoint, expirationTime, keys: { p256dh, auth } };
}

function validBrowserKey(value, expectedBytes, firstByte) {
  if (!BASE64URL.test(value)) return false;
  const decoded = Buffer.from(value, 'base64url');
  return decoded.length === expectedBytes && (firstByte === undefined || decoded[0] === firstByte);
}

function publicEndpointHost(value) {
  const hostname = String(value || '')
    .replace(/^\[|\]$/gu, '')
    .toLowerCase();
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || (!hostname.includes('.') && !net.isIP(hostname))) return false;
  const version = net.isIP(hostname);
  if (version === 4) {
    const [a, b] = hostname.split('.').map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  if (version === 6) return !['::', '::1'].includes(hostname) && !/^f[cd]/u.test(hostname) && !/^fe[89ab]/u.test(hostname);
  return true;
}

export function prunePushSubscriptions(items, options = {}) {
  const now = Number(options.now || Date.now());
  const cutoff = now - Number(options.maxAgeDays ?? 180) * DAY_MS;
  const kept = [];
  const removedIds = [];
  for (const item of Array.isArray(items) ? items : []) {
    const expiration = Number(item?.subscription?.expirationTime || 0);
    const touched = Date.parse(item?.updatedAt || item?.createdAt || '');
    const expired = expiration > 0 && expiration <= now;
    const abandoned = Number.isFinite(touched) && touched < cutoff;
    if (!item?.id || expired || abandoned) removedIds.push(item?.id);
    else kept.push(item);
  }
  return { items: kept, removedIds: removedIds.filter(Boolean) };
}

function subscriptionId(endpoint) {
  return crypto.createHash('sha256').update(endpoint).digest('base64url').slice(0, 32);
}

async function mutateSubscriptions(mutator) {
  const operation = mutationQueue.then(async () => {
    const storage = getStorageProvider();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = typeof storage.loadPushSubscriptions === 'function' ? await storage.loadPushSubscriptions() : [];
      const next = await mutator(structuredClone(current));
      try {
        await storage.savePushSubscriptions(next);
        return next;
      } catch (error) {
        if (Number(error?.response?.status || error?.code) !== 412 || attempt === 2) throw error;
      }
    }
    return [];
  });
  mutationQueue = operation.catch(() => undefined);
  return operation;
}

export async function upsertPushSubscription(memberId, profileId, value, options = {}) {
  if (!publicPushConfig().enabled) throw Object.assign(new Error('Web Push is not configured.'), { statusCode: 503, code: 'PUSH_DISABLED' });
  const subscription = normalizePushSubscription(value);
  const now = new Date().toISOString();
  const record = {
    id: subscriptionId(subscription.endpoint),
    memberId,
    profileId,
    locale: options.locale === 'ru' ? 'ru' : 'en',
    userAgent: String(options.userAgent || '').slice(0, 240),
    subscription,
    createdAt: now,
    updatedAt: now,
  };
  await mutateSubscriptions(items => {
    items = prunePushSubscriptions(items).items;
    const existing = items.find(item => item.id === record.id);
    if (existing) record.createdAt = existing.createdAt || now;
    const others = items.filter(item => item.id !== record.id);
    const memberItems = others
      .filter(item => item.memberId === memberId)
      .sort((a, b) => Date.parse(a.updatedAt || a.createdAt || 0) - Date.parse(b.updatedAt || b.createdAt || 0));
    const oldestIds = new Set(memberItems.slice(0, Math.max(0, memberItems.length - 9)).map(item => item.id));
    return [...others.filter(item => !oldestIds.has(item.id)), record].slice(-500);
  });
  return { id: record.id };
}

export async function cleanupPushSubscriptions(options = {}) {
  const storage = getStorageProvider();
  const current = typeof storage.loadPushSubscriptions === 'function' ? await storage.loadPushSubscriptions() : [];
  const result = prunePushSubscriptions(current, options);
  if (!result.removedIds.length) return { removed: 0 };
  const stale = new Set(result.removedIds);
  await mutateSubscriptions(items => items.filter(item => !stale.has(item.id)));
  return { removed: stale.size };
}

export async function removePushSubscription(memberId, endpoint) {
  if (!memberId || !endpoint) return false;
  const id = subscriptionId(String(endpoint));
  let removed = false;
  await mutateSubscriptions(items => {
    removed = items.some(item => item.id === id && item.memberId === memberId);
    return items.filter(item => item.id !== id || item.memberId !== memberId);
  });
  return removed;
}

const RU_ACTIONS = {
  'assigned you': 'назначил(а) вам задачу',
  'commented on': 'оставил(а) комментарий',
  'mentioned you in': 'упомянул(а) вас',
  'mentioned your team in': 'упомянул(а) вашу команду',
  'mentioned everyone in': 'упомянул(а) всех',
  'is due tomorrow': 'срок завтра',
  'is overdue': 'срок просрочен',
};

export function pushMessagePayload(notification, data, locale = 'en') {
  const actor = notification.by ? data.members?.find(member => member.id === notification.by)?.name : '';
  const task = notification.task ? data.tasks?.find(item => item.id === notification.task) : null;
  const action = locale === 'ru' ? RU_ACTIONS[notification.text] || notification.text : notification.text;
  const title = actor ? `${actor}: ${action}` : task ? `${task.title}: ${action}` : action || 'Smena Manager';
  return {
    title,
    body:
      notification.snippet || task?.title || (locale === 'ru' ? 'Откройте уведомления, чтобы узнать подробности.' : 'Open notifications to see the details.'),
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    tag: `smena-notification-${notification.id}`,
    url: notificationPath(data),
  };
}

export async function deliverPushNotifications(data, notifications = []) {
  const config = pushConfig();
  if (!config.enabled || !notifications.length) return { delivered: 0, removed: 0 };
  const storage = getStorageProvider();
  const storedSubscriptions = await storage.loadPushSubscriptions();
  const pruned = prunePushSubscriptions(storedSubscriptions);
  const subscriptions = pruned.items;
  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  const stale = new Set(pruned.removedIds);
  let delivered = 0;

  await Promise.all(
    notifications.map(async notification => {
      const preference = pushPreferenceForNotification(notification);
      if (!preference || notificationPreferencesForMember(data, notification.recipient)[preference] !== true) return;
      const targets = subscriptions.filter(item => item.memberId === notification.recipient);
      await Promise.all(
        targets.map(async target => {
          try {
            await webpush.sendNotification(target.subscription, JSON.stringify(pushMessagePayload(notification, data, target.locale)), {
              TTL: 60 * 60 * 24,
              urgency: notification.type === 'due' ? 'high' : 'normal',
            });
            delivered += 1;
          } catch (error) {
            if ([404, 410].includes(Number(error?.statusCode))) stale.add(target.id);
            else console.error('[Push] Delivery failed:', error?.message || error);
          }
        }),
      );
    }),
  );

  if (stale.size) await mutateSubscriptions(items => items.filter(item => !stale.has(item.id)));
  return { delivered, removed: stale.size };
}
