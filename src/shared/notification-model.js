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

export function addWorkspaceNotification(data, notification) {
  const recipient = notification?.recipient;
  const actor = notification?.by || data?.me;
  if (!recipient || recipient === actor || !Array.isArray(data?.notifs)) return null;
  if (Array.isArray(data?.members) && !data.members.some(member => member.id === recipient)) return null;

  const created = {
    ...notification,
    recipient,
    by: actor || null,
    at: notification.at || Date.now(),
    read: false,
  };
  data.notifs.unshift(created);
  return created;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function mentionedMemberIds(text, members = []) {
  const source = String(text || '');
  return members
    .filter(member => member?.id && member?.name)
    .filter(member => new RegExp(`(^|\\s)@${escapeRegExp(member.name)}(?=$|[\\s.,!?;:)])`, 'iu').test(source))
    .map(member => member.id);
}
