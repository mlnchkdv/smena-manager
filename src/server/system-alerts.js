import { issueObservations, reconcileSystemIncidents } from '../shared/system-incidents.js';
import { activeWorkspaceAdministrators } from '../shared/workspace-membership.js';
import { deliverWorkspaceNotifications } from './notification-delivery.js';
import { getWorkspaceDatabase, mutateWorkspaceDatabase } from './workspace-store.js';

export async function notifyAdministratorsAboutSystemIssue(issues, options = {}) {
  const observations = options.observations || issueObservations(issues);
  if (!observations.length) return { created: 0 };
  const at = new Date(options.at || Date.now()).getTime();
  let created = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await getWorkspaceDatabase();
    if (!observations.some(o => o.state === 'active' || current.notifs?.some(n => n.incident?.component === o.component && n.incident.state === 'active')))
      return { created: 0 };
    try {
      const next = await mutateWorkspaceDatabase(
        database => {
          created = reconcileSystemIncidents(database, observations, activeWorkspaceAdministrators(database), at);
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
