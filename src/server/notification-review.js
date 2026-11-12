/** The first VPS start requires a reviewed queue. Existing Vercel deployments keep their policy. */
export function notificationDeliveryPaused(data, env = process.env) {
  if (typeof data._notificationDeliveryReview?.paused === 'boolean') return data._notificationDeliveryReview.paused;
  if (['true', 'false'].includes(env.NOTIFICATION_START_PAUSED)) return env.NOTIFICATION_START_PAUSED === 'true';
  return env.NODE_ENV === 'production' && !env.VERCEL;
}

const pendingChannels = job => Object.entries(job.channels || {}).filter(([, state]) => !['sent', 'skipped'].includes(state.status));
const time = value => (typeof value === 'number' ? value : Date.parse(value));

export function notificationReviewStatus(data, env = process.env, now = Date.now()) {
  const jobs = (data._notificationOutbox || []).filter(job => pendingChannels(job).length);
  const cutoff = now - 7 * 86400000;
  const recipients = new Map((data.members || []).map(member => [member.id, member.name || member.id]));
  return {
    paused: notificationDeliveryPaused(data, env),
    revision: data.revision,
    reviewedAt: data._notificationDeliveryReview?.reviewedAt || null,
    jobs: jobs.length,
    olderThanWeek: jobs.filter(job => time(job.createdAt) < cutoff).length,
    cutoff: new Date(cutoff).toISOString(),
    truncated: jobs.length > 50,
    preview: jobs.slice(0, 50).map(job => ({
      id: job.id,
      createdAt: job.createdAt,
      recipient: recipients.get(job.notification?.recipient) || '—',
      channels: pendingChannels(job).map(([name]) => name),
    })),
  };
}

/** Caller is admin-only and writes with the exact preview revision (no automatic CAS retry). */
export function reviewNotificationQueue(data, input, actor, now = Date.now()) {
  if (!Number.isSafeInteger(input.revision) || input.revision !== data.revision)
    throw Object.assign(new Error('Queue changed. Refresh the preview before continuing.'), { statusCode: 409, code: 'REVISION_CONFLICT' });
  if (!['pause', 'resume', 'skip-before'].includes(input.action)) throw Object.assign(new Error('Invalid queue action.'), { statusCode: 400 });
  if (input.action === 'skip-before') {
    const cutoff = Date.parse(input.cutoff);
    if (!Number.isFinite(cutoff) || cutoff > now) throw Object.assign(new Error('Invalid queue cutoff.'), { statusCode: 400 });
    const jobs = (data._notificationOutbox || []).filter(job => time(job.createdAt) < cutoff);
    if (jobs.some(job => pendingChannels(job).some(([, channel]) => channel.leaseUntil > now)))
      throw Object.assign(new Error('A delivery is in progress. Pause and wait before skipping.'), { statusCode: 409 });
    for (const job of jobs)
      for (const [, channel] of pendingChannels(job)) Object.assign(channel, { status: 'skipped', reason: 'operator_skip', leaseUntil: 0 });
  }
  data._notificationDeliveryReview = {
    paused: input.action === 'resume' ? false : input.action === 'pause' ? true : notificationDeliveryPaused(data),
    reviewedAt: new Date(now).toISOString(),
    reviewedBy: actor,
  };
  return data;
}
