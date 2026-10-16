const PREFERENCE_BY_TYPE = Object.freeze({
  mention: 'push_mention',
  assign: 'push_assign',
  comment: 'push_comment',
});

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
  return PREFERENCE_BY_TYPE[notification?.type] || null;
}

export function canDeliverBrowserNotification(notification, preferences, permission = browserNotificationState()) {
  const key = browserNotificationPreferenceKey(notification);
  return permission === 'granted' && !!key && preferences?.[key] === true;
}

export function browserNotificationContent(notification, data, translate = value => value) {
  const actor = notification?.by ? data?.members?.find(member => member.id === notification.by)?.name : '';
  const task = notification?.task ? data?.tasks?.find(item => item.id === notification.task) : null;
  const action = translate(notification?.text || 'New notification');
  return {
    title: actor ? `${actor} ${action}` : action,
    body: notification?.snippet || task?.title || translate('Open notifications to see the details.'),
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
