import { notificationRecipient } from '../shared/notification-model.js';
import { getWorkspaceDatabase, replaceWorkspaceDatabase, RevisionConflictError } from './workspace-store.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export function pruneWorkspaceNotifications(value, options = {}) {
  const data = structuredClone(value);
  const now = Number(options.now || Date.now());
  const readCutoff = now - Number(options.readRetentionDays ?? 90) * DAY_MS;
  const unreadCutoff = now - Number(options.unreadRetentionDays ?? 365) * DAY_MS;
  const maxPerMember = Math.max(50, Number(options.maxPerMember || 500));
  const retainedCounts = new Map();
  let removed = 0;

  data.notifs = (data.notifs || [])
    .slice()
    .sort((a, b) => Number(b.at || 0) - Number(a.at || 0))
    .filter(notification => {
      const recipient = notificationRecipient(notification, data) || '__unknown__';
      const ageExpired = notification.read ? Number(notification.at || 0) < readCutoff : Number(notification.at || 0) < unreadCutoff;
      const count = retainedCounts.get(recipient) || 0;
      if (ageExpired || count >= maxPerMember) {
        removed += 1;
        return false;
      }
      retainedCounts.set(recipient, count + 1);
      return true;
    });

  return { data, removed };
}

export async function runNotificationCleanup(options = {}) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await getWorkspaceDatabase();
    const result = pruneWorkspaceNotifications(current, options);
    if (!result.removed) return { removed: 0, revision: current.revision };
    try {
      const saved = await replaceWorkspaceDatabase(result.data, current.revision, { role: 'admin' });
      return { removed: result.removed, revision: saved.revision };
    } catch (error) {
      if (!(error instanceof RevisionConflictError) || attempt === 2) throw error;
    }
  }
  throw new Error('Notification cleanup could not acquire the current workspace revision.');
}
