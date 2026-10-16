function primaryRecipient(data) {
  if (data?.me) return data.me;
  const members = Array.isArray(data?.members) ? data.members : [];
  return members.find(member => String(member?.role || '').toLowerCase() === 'owner')?.id || members[0]?.id || null;
}

export const DEFAULT_NOTIFICATION_PREFERENCES = Object.freeze({
  mention_all: true,
  mention_team: true,
  mention_ws: false,
  assign_self: true,
  assign_status: true,
  assign_over: true,
  comment_assigned: true,
});

const preferenceForType = {
  mention: 'mention_all',
  assign: 'assign_self',
  comment: 'comment_assigned',
  update: 'assign_status',
};

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
  const preferences = data.notifPrefs;
  if (fallbackRecipient && preferences && Object.values(preferences).some(item => typeof item === 'boolean')) {
    data.notifPrefs = { [fallbackRecipient]: preferences };
  }
  return data;
}

export function notificationPreferencesForMember(data, memberId = data?.me) {
  const stored = memberId && data?.notifPrefs?.[memberId];
  return { ...DEFAULT_NOTIFICATION_PREFERENCES, ...(stored && typeof stored === 'object' ? stored : {}) };
}

export function setNotificationPreference(data, memberId, key, value) {
  if (!memberId || !Object.hasOwn(DEFAULT_NOTIFICATION_PREFERENCES, key)) return false;
  if (!data.notifPrefs || typeof data.notifPrefs !== 'object' || Array.isArray(data.notifPrefs)) data.notifPrefs = {};
  const current = notificationPreferencesForMember(data, memberId);
  data.notifPrefs[memberId] = { ...current, [key]: Boolean(value) };
  return true;
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
  const preference = preferenceForType[notification.type];
  if (preference && notificationPreferencesForMember(data, recipient)[preference] === false) return null;

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
