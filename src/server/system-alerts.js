import crypto from 'node:crypto';
import { addWorkspaceNotification } from '../shared/notification-model.js';
import { activeWorkspaceAdministrators } from '../shared/workspace-membership.js';
import { deliverWorkspaceNotifications } from './notification-delivery.js';
import { getWorkspaceDatabase, mutateWorkspaceDatabase } from './workspace-store.js';

export async function notifyAdministratorsAboutSystemIssue(issues, options = {}) {
  const messages = [...new Set((issues || []).filter(Boolean).map(String))];
  if (!messages.length) return { created: 0 };
  const day = new Date(options.at || Date.now()).toISOString().slice(0, 10);
  const fingerprint = crypto.createHash('sha256').update(messages.sort().join('|')).digest('hex').slice(0, 12);
  const prefix = `system-${day}-${fingerprint}`;
  let created = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await getWorkspaceDatabase();
    try {
      const next = await mutateWorkspaceDatabase(
        database => {
          created = [];
          for (const administrator of activeWorkspaceAdministrators(database)) {
            const id = `${prefix}-${administrator.id}`;
            if ((database.notifs || []).some(notification => notification.id === id)) continue;
            created.push(
              addWorkspaceNotification(database, {
                id,
                recipient: administrator.id,
                by: null,
                type: 'system',
                text: 'System check needs attention',
                snippet: messages.join(' · '),
                at: Date.now(),
              }),
            );
          }
          return database;
        },
        current.revision,
        { role: 'admin' },
      );
      if (created.length) await deliverWorkspaceNotifications(next, created, { source: 'system' });
      return { created: created.length };
    } catch (error) {
      if (error?.code !== 'REVISION_CONFLICT' || attempt === 2) throw error;
    }
  }
  return { created: 0 };
}
