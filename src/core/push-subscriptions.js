import { deletePushSubscription, getPushConfig, savePushSubscription } from './api.js';
import { isRussian } from './i18n.js';

function decodeApplicationServerKey(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from(raw, character => character.charCodeAt(0));
}

export function webPushSupport() {
  return Boolean('serviceWorker' in navigator && 'PushManager' in window && typeof Notification !== 'undefined');
}

export async function enableWebPush() {
  if (!webPushSupport()) throw Object.assign(new Error('This browser does not support background notifications.'), { code: 'PUSH_UNSUPPORTED' });
  const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
  if (permission !== 'granted') throw Object.assign(new Error('Browser notifications are blocked.'), { code: 'PUSH_BLOCKED' });
  const config = await getPushConfig();
  if (!config.enabled || !config.publicKey) throw Object.assign(new Error('Background notifications are not configured yet.'), { code: 'PUSH_DISABLED' });
  const registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeApplicationServerKey(config.publicKey),
    });
  }
  await savePushSubscription(subscription.toJSON(), isRussian() ? 'ru' : 'en');
  return subscription;
}

export async function disableWebPush() {
  if (!webPushSupport()) return false;
  const registration = await navigator.serviceWorker.getRegistration('/sw.js');
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return false;
  await deletePushSubscription(subscription.endpoint).catch(() => undefined);
  return subscription.unsubscribe();
}
