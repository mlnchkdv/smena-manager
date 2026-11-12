import crypto from 'node:crypto';
import { getWorkspaceStatus, listWorkspaceBackups } from './workspace-store.js';
import { notificationDeliveryStatus } from './notification-delivery.js';
import { evaluateOperationalHealth } from './operational-health.js';
import { workspaceDirectoryEntries } from './workspace-directory.js';
import { inWorkspace } from './workspace-context.js';

export function monitorAuthorized(request, env = process.env) {
  if (env.VERCEL || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket?.remoteAddress)) return false;
  const secret = env.MONITOR_SECRET || '',
    received = request.get('authorization') || '';
  const expected = 'Bearer ' + secret;
  return (
    secret.length >= 32 && Buffer.byteLength(expected) === Buffer.byteLength(received) && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received))
  );
}
export async function monitorReadiness() {
  const scopes = ['default', ...(await workspaceDirectoryEntries()).map(entry => entry.id)];
  const summaries = [];
  for (const scope of scopes) {
    try {
      summaries.push(
        await inWorkspace(scope, async () => {
          const [workspace, notifications, backups] = await Promise.all([getWorkspaceStatus(), notificationDeliveryStatus(), listWorkspaceBackups()]);
          const health = evaluateOperationalHealth({ workspace, ...notifications });
          const at = Math.max(0, ...backups.map(item => Date.parse(item.createdAt)).filter(Number.isFinite));
          const issues = health.issues.map(issue => issue.code);
          if (!at || Date.now() - at > 36 * 3600000) issues.push('backup_stale');
          if (notifications.review.paused) issues.push('delivery_paused');
          return { issues };
        }),
      );
    } catch {
      summaries.push({ issues: ['workspace_unavailable'] });
    }
  }
  return {
    status: summaries.some(item => item.issues.length) ? 'degraded' : 'ready',
    workspaces: summaries.length,
    issues: [...new Set(summaries.flatMap(item => item.issues))],
    checkedAt: new Date().toISOString(),
  };
}
