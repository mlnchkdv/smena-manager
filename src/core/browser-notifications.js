import { pushPreferenceForNotification } from '../shared/notification-model.js';
import { notificationAction, notificationLocale, notificationSnippet } from '../shared/notification-copy.js';

export function browserNotificationState() {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

export async function requestBrowserNotificationPermission() {
  if (typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
}

export function browserNotificationPreferenceKey(notification) {
  return pushPreferenceForNotification(notification);
}

export function canDeliverBrowserNotification(notification, preferences, permission = browserNotificationState()) {
  const key = browserNotificationPreferenceKey(notification);
  return permission === 'granted' && !!key && preferences?.[key] === true;
}

export function browserNotificationContent(notification, data, translate = value => value) {
  const locale = notificationLocale(data, notification?.recipient);
  const actor = notification?.by ? data?.members?.find(member => member.id === notification.by)?.name : '';
  const task = notification?.task ? data?.tasks?.find(item => item.id === notification.task) : null;
  const action = translate(notificationAction(notification, locale) || 'New notification');
  return {
    title: actor ? `${actor} ${action}` : action,
    body: notificationSnippet(notification, locale) || task?.title || translate('Open notifications to see the details.'),
  };
}

export function deliverBrowserNotification(notification, data, preferences, options = {}) {
  if (!canDeliverBrowserNotification(notification, preferences)) return null;
  const content = browserNotificationContent(notification, data, options.translate);
  const alert = new Notification(content.title, {
    body: content.body,
    icon: '/favicon.svg',
    tag: `smena-notification-${notification.id}`,
  });
  alert.onclick = () => {
    options.onOpen?.(notification);
    alert.close();
  };
  return alert;
}
