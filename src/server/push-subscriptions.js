import { workspaceState } from './workspace-context.js';
const state = workspaceState(() => ({ mutationQueue: Promise.resolve() }));
import crypto from 'node:crypto';
import webpush from 'web-push';
import { getStorageProvider } from './storage/index.js';
import { notificationPreferencesForMember, pushPreferenceForNotification } from '../shared/notification-model.js';
import { notificationPath } from '../shared/notification-links.js';
import { notificationAction, notificationLocale, notificationSnippet } from '../shared/notification-copy.js';
import { storageVersion } from './storage/version-token.js';
import { reportProviderError } from './provider-safety.js';

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
    (url.port && url.port !== '443') ||
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
  // Browser push endpoints are issued by known push services. Do not resolve
  // user-controlled hosts: DNS rebinding and IPv4-mapped IPv6 bypass deny lists.
  const hostname = String(value || '').toLowerCase();
  return (
    hostname === 'fcm.googleapis.com' ||
    hostname === 'updates.push.services.mozilla.com' ||
    hostname === 'web.push.apple.com' ||
    hostname.endsWith('.push.apple.com') ||
    hostname === 'wns.windows.com' ||
    hostname.endsWith('.notify.windows.com')
  );
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
  const operation = state().mutationQueue.then(async () => {
    const storage = getStorageProvider();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = typeof storage.loadPushSubscriptions === 'function' ? await storage.loadPushSubscriptions() : [];
      const next = await mutator(structuredClone(current));
      try {
        await storage.savePushSubscriptions(next, { expectedEtag: storageVersion(current) });
        return next;
      } catch (error) {
        if (Number(error?.response?.status || error?.code) !== 412 || attempt === 2) throw error;
      }
    }
    return [];
  });
  state().mutationQueue = operation.catch(() => undefined);
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

export function pushMessagePayload(notification, data, locale = notificationLocale(data, notification.recipient)) {
  const actor = notification.by ? data.members?.find(member => member.id === notification.by)?.name : '';
  const task = notification.task ? data.tasks?.find(item => item.id === notification.task) : null;
  const action = notificationAction(notification, locale);
  const title = actor ? `${actor}: ${action}` : task ? `${task.title}: ${action}` : action || 'Smena Manager';
  return {
    title,
    body:
      notificationSnippet(notification, locale) ||
      task?.title ||
      (locale === 'ru' ? 'Откройте уведомления, чтобы узнать подробности.' : 'Open notifications to see the details.'),
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    tag: `smena-notification-${notification.id}`,
    url: notificationPath(data, notification),
  };
}

const transientStatus = status => !status || status === 408 || status === 425 || status === 429 || status >= 500;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function pushDeliveryStatus() {
  const config = publicPushConfig();
  if (!config.enabled) return { configured: false, subscriptions: 0 };
  const storage = getStorageProvider();
  const items = typeof storage.loadPushSubscriptions === 'function' ? await storage.loadPushSubscriptions() : [];
  const pruned = prunePushSubscriptions(items);
  return { configured: true, subscriptions: pruned.items.length, stale: pruned.removedIds.length };
}

export async function deliverPushNotifications(data, notifications = [], options = {}) {
  const config = pushConfig();
  if (!config.enabled || !notifications.length) {
    return { configured: config.enabled, attempted: 0, delivered: 0, failed: 0, retried: 0, removed: 0 };
  }
  const storage = getStorageProvider();
  const storedSubscriptions = await storage.loadPushSubscriptions();
  const pruned = prunePushSubscriptions(storedSubscriptions);
  const subscriptions = pruned.items;
  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  const stale = new Set(pruned.removedIds);
  const sender = options.send || ((subscription, payload, settings) => webpush.sendNotification(subscription, payload, settings));
  let attempted = 0;
  let delivered = 0;
  let failed = 0;
  let retried = 0;

  await Promise.all(
    notifications.map(async notification => {
      const preference = pushPreferenceForNotification(notification);
      if (!preference || notificationPreferencesForMember(data, notification.recipient)[preference] !== true) return;
      const targets = subscriptions.filter(item => item.memberId === notification.recipient);
      await Promise.all(
        targets.map(async target => {
          try {
            normalizePushSubscription(target.subscription);
          } catch {
            stale.add(target.id);
            return;
          }
          attempted += 1;
          const payload = JSON.stringify(pushMessagePayload(notification, data, notificationLocale(data, notification.recipient, target.locale)));
          const settings = { TTL: 60 * 60 * 24, urgency: notification.type === 'due' ? 'high' : 'normal' };
          for (let attempt = 0; attempt < 2; attempt += 1) {
            try {
              await sender(target.subscription, payload, settings);
              delivered += 1;
              return;
            } catch (error) {
              const status = Number(error?.statusCode || error?.status || 0);
              if ([404, 410].includes(status)) {
                stale.add(target.id);
                failed += 1;
                return;
              }
              if (attempt === 0 && transientStatus(status)) {
                retried += 1;
                await (options.wait || wait)(Number(options.retryDelayMs ?? 250));
                continue;
              }
              failed += 1;
              reportProviderError('[Push] Delivery failed', error);
              return;
            }
          }
        }),
      );
    }),
  );

  if (stale.size) await mutateSubscriptions(items => items.filter(item => !stale.has(item.id)));
  return { configured: true, attempted, delivered, failed, retried, removed: stale.size };
}
