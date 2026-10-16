function primaryRecipient(data) {
  if (data?.me) return data.me;
  const members = Array.isArray(data?.members) ? data.members : [];
  return members.find(member => String(member?.role || '').toLowerCase() === 'owner')?.id || members[0]?.id || null;
}

export const DEFAULT_NOTIFICATION_PREFERENCES = Object.freeze({
  mention_all: true,
  mention_team: true,
  mention_ws: true,
  assign_self: true,
  assign_status: true,
  assign_over: true,
  comment_assigned: true,
  push_mention: false,
  push_assign: false,
  push_comment: false,
  push_due: false,
});

const preferenceForType = {
  assign: 'assign_self',
  comment: 'comment_assigned',
  update: 'assign_status',
};

function preferenceForNotification(notification) {
  if (notification?.type === 'mention') {
    if (notification.scope === 'team') return 'mention_team';
    if (notification.scope === 'workspace') return 'mention_ws';
    return 'mention_all';
  }
  return preferenceForType[notification?.type];
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
  const preference = preferenceForNotification(notification);
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

function containsMention(text, value) {
  if (!value) return false;
  return new RegExp(`(^|[\\s([{])@${escapeRegExp(value)}(?=$|[\\s.,!?;:)\\]}…])`, 'iu').test(String(text || ''));
}

export function mentionedMemberIds(text, members = []) {
  return members
    .filter(member => member?.id && member?.name)
    .filter(member => containsMention(text, member.name))
    .map(member => member.id);
}

export function mentionedTeamIds(text, teams = []) {
  return teams
    .filter(team => team?.id && team?.name)
    .filter(team => containsMention(text, team.name))
    .map(team => team.id);
}

export function mentionsWorkspace(text) {
  return ['workspace', 'пространство', 'все'].some(alias => containsMention(text, alias));
}

export function mentionNotificationTargets(text, data = {}) {
  const members = Array.isArray(data.members) ? data.members.filter(member => member?.id && member.status !== 'deactivated') : [];
  const targets = mentionedMemberIds(text, members).map(recipient => ({ recipient, scope: 'direct' }));

  mentionedTeamIds(text, Array.isArray(data.teams) ? data.teams : []).forEach(teamId => {
    members.filter(member => member.team === teamId).forEach(member => targets.push({ recipient: member.id, scope: 'team', team: teamId }));
  });

  if (mentionsWorkspace(text)) {
    members.forEach(member => targets.push({ recipient: member.id, scope: 'workspace' }));
  }
  return targets;
}
