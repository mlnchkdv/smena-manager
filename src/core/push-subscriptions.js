import { deletePushSubscription, getPushConfig, savePushSubscription } from './api.js';
import { isRussian } from './i18n.js';
import { applicationServerKeyMatches, decodeApplicationServerKey, hasEnabledPushPreferences } from '../shared/push-client.js';

export { applicationServerKeyMatches, hasEnabledPushPreferences } from '../shared/push-client.js';

export function webPushSupport() {
  return Boolean('serviceWorker' in navigator && 'PushManager' in window && typeof Notification !== 'undefined');
}

async function ensureWebPushSubscription(config) {
  const registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (subscription && !applicationServerKeyMatches(subscription, config.publicKey)) {
    await deletePushSubscription(subscription.endpoint).catch(() => undefined);
    await subscription.unsubscribe().catch(() => undefined);
    subscription = null;
  }
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeApplicationServerKey(config.publicKey),
    });
  }
  await savePushSubscription(subscription.toJSON(), isRussian() ? 'ru' : 'en');
  return subscription;
}

export async function enableWebPush() {
  if (!webPushSupport()) throw Object.assign(new Error('This browser does not support background notifications.'), { code: 'PUSH_UNSUPPORTED' });
  const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
  if (permission !== 'granted') throw Object.assign(new Error('Browser notifications are blocked.'), { code: 'PUSH_BLOCKED' });
  const config = await getPushConfig();
  if (!config.enabled || !config.publicKey) throw Object.assign(new Error('Background notifications are not configured yet.'), { code: 'PUSH_DISABLED' });
  return ensureWebPushSubscription(config);
}

export async function syncWebPushSubscription(preferences) {
  if (!webPushSupport()) return 'unsupported';
  if (!hasEnabledPushPreferences(preferences)) {
    await disableWebPush();
    return Notification.permission === 'denied' ? 'denied' : Notification.permission === 'default' ? 'default' : 'idle';
  }
  if (Notification.permission !== 'granted') return Notification.permission;
  const config = await getPushConfig();
  if (!config.enabled || !config.publicKey) return 'unavailable';
  await ensureWebPushSubscription(config);
  return 'ready';
}

export async function disableWebPush() {
  if (!webPushSupport()) return false;
  const registration = await navigator.serviceWorker.getRegistration('/sw.js');
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return false;
  await deletePushSubscription(subscription.endpoint).catch(() => undefined);
  return subscription.unsubscribe();
}
