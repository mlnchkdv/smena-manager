import { getStorageProvider } from './storage/index.js';
import { deliverEmailNotifications, emailAuthorizationStatus } from './email-notifications.js';
import { deliverPushNotifications, pushDeliveryStatus } from './push-subscriptions.js';
import { copyStorageVersion, storageVersion } from './storage/version-token.js';
import { drainNotificationOutbox } from './notification-outbox.js';
import { getWorkspaceDatabase, mutateWorkspaceDatabase } from './workspace-store.js';
import { reportProviderError } from './provider-safety.js';

const EMPTY_CHANNEL = Object.freeze({ attempted: 0, delivered: 0, failed: 0, retried: 0, removed: 0 });
let mutationQueue = Promise.resolve();
let memoryStatus = null;

function cleanChannel(value = {}) {
  return Object.fromEntries(Object.keys(EMPTY_CHANNEL).map(key => [key, Math.max(0, Number(value[key] || 0))]));
}

function cleanStatus(value = {}) {
  return {
    version: 1,
    updatedAt: value.updatedAt || null,
    lastRun: value.lastRun || null,
    lastCron: value.lastCron || null,
    totals: {
      push: cleanChannel(value.totals?.push),
      email: cleanChannel(value.totals?.email),
    },
  };
}

async function loadStatus(storage = getStorageProvider()) {
  const stored = typeof storage.loadNotificationDeliveryStatus === 'function' ? await storage.loadNotificationDeliveryStatus() : memoryStatus;
  return copyStorageVersion(stored, cleanStatus(stored || {}));
}

async function mutateStatus(mutator) {
  const storage = getStorageProvider();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await loadStatus(storage);
    const next = cleanStatus(await mutator(current));
    try {
      if (typeof storage.saveNotificationDeliveryStatus === 'function')
        await storage.saveNotificationDeliveryStatus(next, { expectedEtag: storageVersion(current) });
      memoryStatus = next;
      return next;
    } catch (error) {
      if (Number(error?.response?.status || error?.statusCode || error?.code) !== 412 || attempt === 2) throw error;
    }
  }
  return cleanStatus();
}

export async function recordNotificationDelivery(result, options = {}) {
  const operation = mutationQueue.then(async () => {
    const at = options.at || new Date().toISOString();
    return mutateStatus(current => ({
      ...current,
      updatedAt: at,
      lastRun: {
        at,
        source: options.source || 'workspace',
        notifications: Math.max(0, Number(options.notifications || 0)),
        push: cleanChannel(result.push),
        email: cleanChannel(result.email),
      },
      lastCron: options.cron
        ? { at, status: options.cron.status || 'ok', reminders: options.cron.reminders || null, digest: options.cron.digest || null }
        : current.lastCron,
      totals: {
        push: Object.fromEntries(Object.keys(EMPTY_CHANNEL).map(key => [key, current.totals.push[key] + Number(result.push?.[key] || 0)])),
        email: Object.fromEntries(Object.keys(EMPTY_CHANNEL).map(key => [key, current.totals.email[key] + Number(result.email?.[key] || 0)])),
      },
    }));
  });
  mutationQueue = operation.catch(() => undefined);
  return operation;
}

export async function recordNotificationCronRun(details, options = {}) {
  const operation = mutationQueue.then(async () => {
    const at = options.at || new Date().toISOString();
    return mutateStatus(current => ({ ...current, updatedAt: at, lastCron: { at, status: details.status || 'ok', ...details } }));
  });
  mutationQueue = operation.catch(() => undefined);
  return operation;
}

export async function deliverWorkspaceNotifications(data, notifications = [], options = {}) {
  if (data._notificationOutbox) {
    const channels = { push: { ...EMPTY_CHANNEL }, email: { ...EMPTY_CHANNEL } };
    const sender = (name, send) => async (workspace, events) => {
      const result = await send(workspace, events);
      for (const key of Object.keys(EMPTY_CHANNEL)) channels[name][key] += Number(result[key] || 0);
      return result;
    };
    const result = await drainNotificationOutbox({
      load: getWorkspaceDatabase,
      mutate: (change, revision) => mutateWorkspaceDatabase(change, revision, { role: 'admin', outboxWorker: true }),
      send: { email: sender('email', deliverEmailNotifications), push: sender('push', deliverPushNotifications) },
    });
    if (result.processed)
      await recordNotificationDelivery(channels, { source: options.source || 'outbox', notifications: result.processed }).catch(error =>
        reportProviderError('[Notifications] Delivery diagnostics', error),
      );
    return { ...result, ...channels };
  }
  const [push, email] = await Promise.all([
    deliverPushNotifications(data, notifications).catch(() => ({ ...EMPTY_CHANNEL, failed: notifications.length })),
    deliverEmailNotifications(data, notifications, options).catch(() => ({ ...EMPTY_CHANNEL, failed: notifications.length })),
  ]);
  if (notifications.length) {
    await recordNotificationDelivery({ push, email }, { source: options.source, notifications: notifications.length, cron: options.cron }).catch(error => {
      reportProviderError('[Notifications] Delivery diagnostics', error);
    });
  }
  return { push, email };
}

export async function retryNotificationOutbox() {
  return deliverWorkspaceNotifications(await getWorkspaceDatabase());
}

export async function notificationDeliveryStatus() {
  const [delivery, email, push, data] = await Promise.all([loadStatus(), emailAuthorizationStatus(), pushDeliveryStatus(), getWorkspaceDatabase()]);
  const outbox = notificationQueueStatus(data);
  return { delivery, channels: { email, push }, outbox };
}

export function notificationQueueStatus(data, now = Date.now()) {
  let pending = 0;
  let sending = 0;
  let retrying = 0;
  let oldestPendingAt = null;
  for (const job of data._notificationOutbox || [])
    for (const state of Object.values(job.channels || {})) {
      if (['sent', 'skipped'].includes(state.status)) continue;
      pending += 1;
      if ((state.leaseUntil || 0) > now) sending += 1;
      if (state.attempts > 0) retrying += 1;
      if (!oldestPendingAt || job.createdAt < oldestPendingAt) oldestPendingAt = job.createdAt;
    }
  return { pending, sending, retrying, oldestPendingAt };
}

export function resetNotificationDeliveryForTests() {
  mutationQueue = Promise.resolve();
  memoryStatus = null;
}
