function primaryRecipient(data) {
  if (data?.me) return data.me;
  const members = Array.isArray(data?.members) ? data.members : [];
  return members.find(member => String(member?.role || '').toLowerCase() === 'owner')?.id || members[0]?.id || null;
}

export function notificationRecipient(notification, data) {
  return notification?.recipient || notification?.recipientId || primaryRecipient(data);
}

export function migrateNotificationRecipients(value) {
  if (!value || typeof value !== 'object') return value;
  const data = structuredClone(value);
  if (!Array.isArray(data.notifs)) return data;

  const fallbackRecipient = primaryRecipient(data);
  data.notifs = data.notifs.map(notification => {
    if (!notification || notification.recipient || !fallbackRecipient) return notification;
    return { ...notification, recipient: notification.recipientId || fallbackRecipient };
  });
  return data;
}

export function notificationsForMember(data, memberId = data?.me) {
  if (!memberId || !Array.isArray(data?.notifs)) return [];
  return data.notifs.filter(notification => notificationRecipient(notification, data) === memberId);
}

export function notificationForMember(data, notificationId, memberId = data?.me) {
  return notificationsForMember(data, memberId).find(notification => notification.id === notificationId) || null;
}
