import { addWorkspaceNotification } from './notification-model.js';

export const SYSTEM_COMPONENTS = Object.freeze({
  digest: 'Email digest preparation failed',
  backup: 'Automatic backup failed',
  files: 'File cleanup failed',
  uploads: 'Abandoned upload cleanup failed',
  delivery: 'Notification delivery failed',
  automation: 'Daily automation failed',
});
const componentOf = issue => Object.keys(SYSTEM_COMPONENTS).find(key => SYSTEM_COMPONENTS[key] === issue);
const pendingRefs = data =>
  (data?._notificationOutbox || []).flatMap(job =>
    Object.entries(job.channels || {})
      .filter(([, channel]) => channel.attempts > 0 && !['sent', 'skipped'].includes(channel.status))
      .map(([channel]) => `${job.id}:${channel}`),
  );

export function systemIncidentObservations(run, data, startedAt = Date.now()) {
  const failed = [
    run.digest?.error && 'digest',
    run.backup?.error && 'backup',
    (run.fileCleanup?.error || run.fileCleanup?.failed) && 'files',
    (run.abandonedUploads?.error || run.abandonedUploads?.failed) && 'uploads',
    run.outbox?.failed && 'delivery',
    run.status === 'failed' && 'automation',
  ].filter(Boolean);
  const references = pendingRefs(data);
  const observations = failed.map(component => ({
    component,
    state: 'active',
    refs: component === 'delivery' ? references.slice(0, 100) : [],
    refsOverflow: component === 'delivery' && references.length > 100,
  }));
  const success = (component, evidence, confirmed) => {
    if (confirmed && !failed.includes(component))
      observations.push({
        component,
        state: 'resolved',
        evidence,
        forIncidents: (data?.notifs || [])
          .filter(n => n.incident?.component === component && n.incident.state === 'active' && n.incident.lastAt < startedAt)
          .map(n => ({ id: n.incident.id, lastAt: n.incident.lastAt })),
      });
  };
  success('digest', 'digest_prepared', !!run.digest?.today && Number.isFinite(run.digest?.queued) && !run.digest?.error && !run.digest?.skipped);
  success('backup', 'backup_verified', !!run.backup?.backupId && !run.backup?.error);
  success('files', 'cleanup_completed', run.fileCleanup?.removed > 0 && !run.fileCleanup.error && !run.fileCleanup.failed);
  success(
    'uploads',
    'uploads_verified',
    run.abandonedUploads?.queued > 0 && run.abandonedUploads.queued === run.abandonedUploads.scanned && !run.abandonedUploads.error,
  );
  success('automation', 'automation_completed', run.status === 'ok' && !!run.backup && !!run.fileCleanup && !!run.abandonedUploads && !!run.outbox);
  // An empty queue, skipped recipients or configured credentials do not prove
  // delivery. Every affected job/channel must still have a confirmed receipt.
  const receipts = new Set(
    (data?._notificationOutbox || []).flatMap(job =>
      Object.entries(job.channels || {})
        .filter(([, channel]) => channel.status === 'sent')
        .map(([channel]) => `${job.id}:${channel}`),
    ),
  );
  const active = (data?.notifs || []).filter(n => n.incident?.component === 'delivery' && n.incident.state === 'active');
  success(
    'delivery',
    'delivery_confirmed',
    active.length > 0 &&
      !pendingRefs(data).length &&
      active.every(n => !n.incident.refsOverflow && n.incident.refs?.length > 0 && n.incident.refs.every(ref => receipts.has(ref))),
  );
  // Digest preparation and actual mail delivery are separate components.
  return observations;
}

export function issueObservations(issues) {
  return [...new Set((issues || []).map(componentOf).filter(Boolean))].map(component => ({ component, state: 'active', refs: [] }));
}

export function reconcileSystemIncidents(data, observations, administrators, at = Date.now()) {
  const created = [];
  for (const observation of observations) {
    const { component, state } = observation;
    if (!SYSTEM_COMPONENTS[component] || !['active', 'resolved'].includes(state)) continue;
    const events = (data.notifs || []).filter(n => n.type === 'system' && !n.by && n.incident?.component === component);
    const newest = events.reduce((last, n) => Math.max(last, n.incident.resolvedAt || n.incident.lastAt || 0), 0);
    if (newest >= at) continue; // A slow, older run cannot reopen a newer result.
    const active = events.filter(n => n.incident.state === 'active');
    if (state === 'resolved') {
      if (!observation.evidence) continue;
      for (const event of active) {
        if (observation.forIncidents?.some(guard => guard.id === event.incident.id && guard.lastAt === event.incident.lastAt))
          Object.assign(event.incident, { state: 'resolved', resolvedAt: at, evidence: observation.evidence });
      }
      continue;
    }
    const id = active[0]?.incident.id || `incident-${component}-${at}`;
    for (const event of active) {
      event.incident.lastAt = at;
      const refs = [...new Set([...(event.incident.refs || []), ...(observation.refs || [])])];
      event.incident.refsOverflow ||= observation.refsOverflow || refs.length > 100;
      event.incident.refs = refs.slice(0, 100);
    }
    for (const member of administrators) {
      if (active.some(n => n.recipient === member.id)) continue;
      const notification = addWorkspaceNotification(data, {
        id: `${id}-${member.id}`,
        recipient: member.id,
        by: null,
        type: 'system',
        text: 'System check needs attention',
        snippet: SYSTEM_COMPONENTS[component],
        at,
        incident: {
          id,
          component,
          state: 'active',
          firstAt: active[0]?.incident.firstAt || at,
          lastAt: at,
          refs: [...(observation.refs || [])].slice(0, 100),
          refsOverflow: !!observation.refsOverflow,
        },
      });
      if (notification) created.push(notification);
    }
  }
  return created;
}

export function incidentStateLabel(notification, locale = 'en') {
  if (notification?.type !== 'system' || notification.by) return '';
  const ru = locale === 'ru';
  return notification.incident?.state === 'resolved'
    ? ru
      ? 'Устранено'
      : 'Resolved'
    : notification.incident?.state === 'active'
      ? ru
        ? 'Требует внимания'
        : 'Needs attention'
      : ru
        ? 'Историческое · статус не подтверждён'
        : 'Historical · status unconfirmed';
}
