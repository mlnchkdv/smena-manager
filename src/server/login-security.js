import crypto from 'node:crypto';
import { addWorkspaceNotification } from '../shared/notification-model.js';
import { memberForProfile } from '../shared/member-identity.js';
import { deliverWorkspaceNotifications } from './notification-delivery.js';
import { getWorkspaceDatabase, mutateWorkspaceDatabase, RevisionConflictError } from './workspace-store.js';

function loginNotification(profile, memberId, session) {
  return {
    id: `security-login-${session.id || crypto.randomUUID()}`,
    recipient: memberId,
    by: null,
    type: 'security',
    text: 'New sign-in detected',
    snippet: `${session.device} · ${session.authMethod === 'google' ? 'Google' : session.authMethod === 'access_id' ? 'Access ID' : 'Existing session'}`,
    sessionId: session.id,
    at: Date.now(),
    read: false,
  };
}

export async function recordLoginSecurityNotification(profile, session) {
  if (!profile?.id || !session?.id) return null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await getWorkspaceDatabase();
    const member = memberForProfile(current, profile);
    if (!member?.id) return null;
    const notification = loginNotification(profile, member.id, session);
    try {
      const next = await mutateWorkspaceDatabase(
        data => {
          addWorkspaceNotification(data, notification);
          return data;
        },
        current.revision,
        { role: 'admin' },
      );
      const created = next.notifs.find(item => item.id === notification.id) || null;
      if (created) await deliverWorkspaceNotifications(next, [created], { source: 'security-login' });
      return created;
    } catch (error) {
      if (!(error instanceof RevisionConflictError) || attempt === 2) throw error;
    }
  }
  return null;
}
