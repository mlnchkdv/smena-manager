import crypto from 'node:crypto';
import { emailPreferenceForNotification, notificationPreferencesForMember, pushPreferenceForNotification } from '../shared/notification-model.js';
import { canReadProject } from '../shared/project-access.js';
import { workspaceMemberRole } from '../shared/workspace-access.js';

export function enqueueDigestJobs(data, plan, now = Date.now()) {
  data._notificationOutbox = (data._notificationOutbox || []).filter(
    job => Object.values(job.channels || {}).some(state => !['sent', 'skipped'].includes(state.status)) || now - job.createdAt < 7 * 86400000,
  );
  const queued = [];
  for (const member of plan.recipients) {
    const digestDate = member.digestDate || plan.today;
    const id = `digest:${member.id}:${digestDate}`;
    const prefs = notificationPreferencesForMember(data, member.id);
    if (prefs.emailDigestLastQueuedDate === digestDate || data._notificationOutbox.some(job => job.id === id)) continue;
    data._notificationOutbox.push({
      id,
      createdAt: now,
      notification: { id, recipient: member.id, type: 'digest', digestDate },
      channels: { email: { status: 'pending', attempts: 0, nextAt: now } },
    });
    data.notifPrefs ||= {};
    data.notifPrefs[member.id] = { ...prefs, emailDigestLastQueuedDate: digestDate };
    queued.push(member.id);
  }
  return queued;
}

export function enqueueNotificationEvents(current, candidate, now = Date.now()) {
  const known = new Set((current.notifs || []).map(item => item.id));
  const queue = structuredClone(current._notificationOutbox || []);
  const queued = new Set(queue.map(item => item.id));
  for (const notification of candidate.notifs || []) {
    if (known.has(notification.id) || queued.has(notification.id)) continue;
    const prefs = notificationPreferencesForMember(candidate, notification.recipient);
    const channels = Object.fromEntries(
      [
        ['email', emailPreferenceForNotification(notification)],
        ['push', pushPreferenceForNotification(notification)],
      ]
        .filter(([, key]) => key && prefs[key] === true)
        .map(([name]) => [name, { status: 'pending', attempts: 0, nextAt: now }]),
    );
    if (Object.keys(channels).length) queue.push({ id: notification.id, notification: structuredClone(notification), createdAt: now, channels });
  }
  return queue.filter(
    item => Object.values(item.channels).some(channel => channel.status !== 'sent' && channel.status !== 'skipped') || now - item.createdAt < 7 * 86400000,
  );
}

export function eligibleNotification(data, notification) {
  const member = data.members?.find(item => item.id === notification.recipient);
  if (!member || ['removed', 'deactivated'].includes(member.status)) return false;
  const task = notification.task && data.tasks?.find(item => item.id === notification.task);
  if (notification.task && (!task || task.archived)) return false;
  const project = (task?.project || notification.project) && data.projects?.find(item => item.id === (task?.project || notification.project));
  return !(task?.project || notification.project) || Boolean(project && !project.archived && canReadProject(project, member.id, workspaceMemberRole(member)));
}

// A durable lease plus compare-and-swap protects competing cron/server workers.
// Delivery is at-least-once: a crash after provider acceptance can still retry.
export async function drainNotificationOutbox(options) {
  const now = options.now || Date.now;
  const token = crypto.randomUUID();
  const startedAt = now();
  let processed = 0;
  let failed = 0;
  for (let index = 0; index < (options.limit || 10); index += 1) {
    if (index > 0 && now() - startedAt >= (options.maxDurationMs || 20000)) return { processed, failed, deferred: true };
    let claim;
    let data;
    for (let retry = 0; retry < 3; retry += 1) {
      const current = await options.load();
      claim = null;
      for (const item of current._notificationOutbox || []) {
        for (const [channel, state] of Object.entries(item.channels)) {
          if (['sent', 'skipped'].includes(state.status) || state.nextAt > now() || (state.leaseUntil || 0) > now()) continue;
          claim = { id: item.id, channel, notification: item.notification };
          break;
        }
        if (claim) break;
      }
      if (!claim) return { processed, failed };
      try {
        data = await options.mutate(next => {
          const state = next._notificationOutbox.find(item => item.id === claim.id).channels[claim.channel];
          Object.assign(state, { token, leaseUntil: now() + 120000, status: 'sending', attempts: state.attempts + 1 });
          return next;
        }, current.revision);
        break;
      } catch (error) {
        if (error.code !== 'REVISION_CONFLICT' || retry === 2) throw error;
      }
    }
    let outcome = 'pending';
    let reason = 'provider_error';
    const key = claim.channel === 'email' ? emailPreferenceForNotification(claim.notification) : pushPreferenceForNotification(claim.notification);
    if (!eligibleNotification(data, claim.notification) || !notificationPreferencesForMember(data, claim.notification.recipient)[key]) outcome = 'skipped';
    else {
      try {
        const result = await options.send[claim.channel](data, [claim.notification]);
        if (result.configured && !result.failed && result.delivered > 0) outcome = 'sent';
        else if (result.configured && result.attempted === 0 && !result.failed) {
          outcome = 'skipped';
          reason = 'no_destination';
        } else {
          failed += 1;
          reason = result.configured ? 'provider_error' : 'channel_unavailable';
        }
      } catch {
        failed += 1;
      }
    }
    for (let retry = 0; retry < 3; retry += 1) {
      const current = await options.load();
      try {
        await options.mutate(next => {
          const state = next._notificationOutbox?.find(item => item.id === claim.id)?.channels?.[claim.channel];
          if (state?.token === token) {
            Object.assign(state, {
              reason: outcome === 'sent' ? null : reason,
              status: outcome,
              leaseUntil: 0,
              nextAt: now() + Math.min(3600000, 30000 * 2 ** Math.min(state.attempts, 7)),
            });
            delete state.token;
            if (outcome === 'sent' && claim.notification.type === 'digest') {
              const memberId = claim.notification.recipient;
              next.notifPrefs[memberId] = { ...notificationPreferencesForMember(next, memberId), emailDigestLastDate: claim.notification.digestDate };
            }
          }
          return next;
        }, current.revision);
        break;
      } catch (error) {
        if (error.code !== 'REVISION_CONFLICT' || retry === 2) throw error;
      }
    }
    processed += 1;
  }
  return { processed, failed };
}
