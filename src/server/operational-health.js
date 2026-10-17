const CRON_STALE_AFTER_MS = 36 * 60 * 60 * 1000;

export function evaluateOperationalHealth({ delivery, channels, workspace }, options = {}) {
  const now = new Date(options.now || Date.now()).getTime();
  const issues = [];
  if (!workspace?.storage?.connected || !workspace?.storage?.persistent) issues.push({ code: 'storage', severity: 'critical' });
  if (!workspace?.coordination?.healthy) issues.push({ code: 'coordination', severity: 'critical' });
  if (!channels?.email?.configured || !channels?.email?.authorized) issues.push({ code: 'email', severity: 'warning' });
  if (!channels?.push?.configured) issues.push({ code: 'push', severity: 'warning' });
  const cronAt = new Date(delivery?.lastCron?.at || 0).getTime();
  if (!cronAt || now - cronAt > CRON_STALE_AFTER_MS) issues.push({ code: 'cron_stale', severity: 'critical' });
  else if (delivery?.lastCron?.status !== 'ok') issues.push({ code: 'cron_degraded', severity: 'warning' });
  const deliveryFailures = Number(delivery?.lastRun?.push?.failed || 0) + Number(delivery?.lastRun?.email?.failed || 0);
  if (deliveryFailures) issues.push({ code: 'delivery', severity: 'warning', count: deliveryFailures });
  return {
    status: issues.some(issue => issue.severity === 'critical') ? 'critical' : issues.length ? 'warning' : 'healthy',
    checkedAt: new Date(now).toISOString(),
    issues,
  };
}

export { CRON_STALE_AFTER_MS };
