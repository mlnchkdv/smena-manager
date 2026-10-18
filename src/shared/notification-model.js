import { canReadProject } from './project-access.js';
import { workspaceMemberRole } from './workspace-access.js';

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
  email_mention: false,
  email_assign: false,
  email_comment: false,
  email_update: false,
  email_due: false,
  email_digest: false,
  push_mention: false,
  push_assign: false,
  push_comment: false,
  push_update: false,
  push_due: false,
  email_security: true,
  push_security: true,
});

const preferenceForType = {
  assign: 'assign_self',
  comment: 'comment_assigned',
  due: 'assign_over',
  update: 'assign_status',
};

const pushPreferenceForType = Object.freeze({
  mention: 'push_mention',
  assign: 'push_assign',
  comment: 'push_comment',
  update: 'push_update',
  due: 'push_due',
  security: 'push_security',
  system: 'push_security',
});

export function pushPreferenceForNotification(notification) {
  return pushPreferenceForType[notification?.type] || null;
}

const emailPreferenceForType = Object.freeze({
  mention: 'email_mention',
  assign: 'email_assign',
  comment: 'email_comment',
  update: 'email_update',
  digest: 'email_digest',
  due: 'email_due',
  security: 'email_security',
  system: 'email_security',
});

export function emailPreferenceForNotification(notification) {
  return emailPreferenceForType[notification?.type] || null;
}

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
  const actor = Object.hasOwn(notification || {}, 'by') ? notification.by : data?.me;
  const isExplicitSelfMention = notification?.type === 'mention' && notification?.scope === 'direct';
  if (!recipient || (actor && recipient === actor && !isExplicitSelfMention) || !Array.isArray(data?.notifs)) return null;
  if (Array.isArray(data?.members) && !data.members.some(member => member.id === recipient)) return null;
  const recipientMember = data.members?.find(member => member.id === recipient);
  if (recipientMember && ['deactivated', 'removed'].includes(recipientMember.status)) return null;
  const relatedTask = notification.task && data.tasks?.find(task => task.id === notification.task);
  const relatedProject = data.projects?.find(project => project.id === (notification.project || relatedTask?.project));
  if (relatedProject && !canReadProject(relatedProject, recipient, workspaceMemberRole(recipientMember))) return null;
  const existing = notification?.id && data.notifs.find(item => item?.id === notification.id);
  if (existing) return existing;
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
    .filter(member => members.filter(other => other.name?.toLocaleLowerCase() === member.name.toLocaleLowerCase()).length === 1)
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

export function mentionNotificationTargets(text, data = {}, references = []) {
  const members = Array.isArray(data.members) ? data.members.filter(member => member?.id && member.status !== 'deactivated') : [];
  const targets = mentionedMemberIds(text, members).map(recipient => ({ recipient, scope: 'direct' }));
  for (const reference of Array.isArray(references) ? references.slice(0, 100) : []) {
    if (reference?.kind !== 'member' || typeof reference.label !== 'string' || !containsMention(text, reference.label)) continue;
    if (members.some(member => member.id === reference.id)) targets.push({ recipient: reference.id, scope: 'direct' });
  }

  mentionedTeamIds(text, Array.isArray(data.teams) ? data.teams : []).forEach(teamId => {
    members.filter(member => member.team === teamId).forEach(member => targets.push({ recipient: member.id, scope: 'team', team: teamId }));
  });

  if (mentionsWorkspace(text)) {
    members.forEach(member => targets.push({ recipient: member.id, scope: 'workspace' }));
  }
  return targets;
}

const STATUS_LABELS = Object.freeze({
  backlog: 'Backlog',
  todo: 'To do',
  progress: 'In progress',
  review: 'Review',
  done: 'Done',
});

function serverNotificationId(revision, kind, sourceId, recipient) {
  return `n-${revision}-${kind}-${sourceId}-${recipient}`;
}

function preserveNotificationReadState(current, candidate, actorMemberId) {
  const requested = new Map((candidate.notifs || []).filter(item => item?.id).map(item => [item.id, item]));
  return (current.notifs || []).map(notification => {
    const update = requested.get(notification.id);
    if (!update || notificationRecipient(notification, current) !== actorMemberId) return structuredClone(notification);
    return { ...structuredClone(notification), read: Boolean(update.read) };
  });
}

function createServerNotification(data, details, context) {
  return addWorkspaceNotification(data, {
    ...details,
    id: serverNotificationId(context.revision, details.type, context.sourceId, details.recipient),
    by: context.actorMemberId,
    at: context.at,
  });
}

export function reconcileWorkspaceNotifications(current, candidate, options = {}) {
  const actorMemberId = options.actorMemberId;
  if (!actorMemberId) return candidate;
  const revision = Number(options.revision || Number(current?.revision || 0) + 1);
  const now = Number(options.now || Date.now());
  const data = structuredClone(candidate);
  data.notifs = preserveNotificationReadState(current, data, actorMemberId);

  const currentTasks = new Map((current.tasks || []).filter(item => item?.id).map(item => [item.id, item]));
  const currentComments = new Set((current.comments || []).filter(item => item?.id).map(item => item.id));
  data.comments = (data.comments || []).map(comment => {
    if (currentComments.has(comment?.id)) return comment;
    const result = { ...comment, by: actorMemberId, at: now };
    for (const field of ['re', 'reactions']) {
      if (result[field])
        result[field] = Object.fromEntries(
          Object.entries(result[field]).map(([emoji, members]) => [emoji, members.includes(actorMemberId) ? [actorMemberId] : []]),
        );
    }
    return result;
  });

  for (const task of data.tasks || []) {
    if (!task?.id) continue;
    const previous = currentTasks.get(task.id);
    if (previous?.createdBy) task.createdBy = previous.createdBy;
    else if (!previous) task.createdBy = actorMemberId;
    else delete task.createdBy;
    const descriptionText = value =>
      String(value || '')
        .replace(/<[^>]*>/gu, ' ')
        .replace(/&nbsp;/gu, ' ')
        .replace(/&amp;/gu, '&');
    const oldMentions = new Set(mentionNotificationTargets(descriptionText(previous?.desc), current).map(target => `${target.scope}:${target.recipient}`));
    if (task.desc !== previous?.desc)
      for (const target of mentionNotificationTargets(descriptionText(task.desc), data)) {
        if (oldMentions.has(`${target.scope}:${target.recipient}`)) continue;
        createServerNotification(
          data,
          {
            recipient: target.recipient,
            type: 'mention',
            task: task.id,
            text: target.scope === 'direct' ? 'mentioned you in' : target.scope === 'team' ? 'mentioned your team in' : 'mentioned everyone in',
            snippet: descriptionText(task.desc).trim(),
            scope: target.scope,
            ...(target.team ? { team: target.team } : {}),
          },
          { actorMemberId, revision, sourceId: `description-${task.id}`, at: now },
        );
      }
    if (task.assignee && (!previous || previous.assignee !== task.assignee)) {
      createServerNotification(
        data,
        {
          recipient: task.assignee,
          type: 'assign',
          task: task.id,
          text: 'assigned you',
          snippet: task.title || 'New task',
        },
        { actorMemberId, revision, sourceId: task.id, at: now },
      );
    }
    if (previous && previous.status !== task.status && task.assignee) {
      createServerNotification(
        data,
        {
          recipient: task.assignee,
          type: 'update',
          task: task.id,
          text: task.status === 'done' ? 'completed' : `moved to ${STATUS_LABELS[task.status] || task.status}`,
          snippet: `${STATUS_LABELS[previous.status] || previous.status} → ${STATUS_LABELS[task.status] || task.status}`,
        },
        { actorMemberId, revision, sourceId: task.id, at: now },
      );
    }
  }

  const tasks = new Map((data.tasks || []).filter(item => item?.id).map(item => [item.id, item]));
  for (const comment of data.comments || []) {
    if (!comment?.id || currentComments.has(comment.id) || comment.by !== actorMemberId) continue;
    const task = tasks.get(comment.task);
    if (!task) continue;
    const notified = new Set();
    const mentionText = {
      direct: 'mentioned you in',
      team: 'mentioned your team in',
      workspace: 'mentioned everyone in',
    };
    for (const target of mentionNotificationTargets(comment.text, data, comment.mentions)) {
      if ((target.recipient === actorMemberId && target.scope !== 'direct') || notified.has(target.recipient)) continue;
      const created = createServerNotification(
        data,
        {
          recipient: target.recipient,
          type: 'mention',
          task: task.id,
          text: mentionText[target.scope],
          snippet: comment.text,
          scope: target.scope,
          ...(target.team ? { team: target.team } : {}),
        },
        { actorMemberId, revision, sourceId: comment.id, at: Number(comment.at) || now },
      );
      if (created) notified.add(target.recipient);
    }
    for (const recipient of new Set([task.assignee, task.createdBy].filter(Boolean)))
      if (recipient !== actorMemberId && !notified.has(recipient)) {
        createServerNotification(
          data,
          {
            recipient,
            type: 'comment',
            task: task.id,
            text: 'commented on',
            snippet: comment.text,
          },
          { actorMemberId, revision, sourceId: comment.id, at: Number(comment.at) || now },
        );
      }
  }

  return data;
}
