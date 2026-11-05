export const MEDIA_COPY_ACTIVE_USER_LIMIT = 4;
export const MEDIA_COPY_ACTIVE_WORKSPACE_LIMIT = 16;
export const MEDIA_COPY_RETAINED_LIMIT = 64;
export const mediaCopyArchived = (job, now = Date.now()) => !!job.archived || (Number.isFinite(job.expiresAt) && job.expiresAt <= now);
export function mediaCopySettings(input = {}, now = Date.now()) {
  const label = String(input.label || '').trim();
  const days = Number(input.retentionDays ?? 0);
  if (!label || label.length > 120 || ![0, 7, 30, 90].includes(days))
    throw Object.assign(new TypeError('Use a name up to 120 characters and a supported retention period.'), { code: 'MEDIA_COPY_SETTINGS', statusCode: 400 });
  return { label, retentionDays: days, expiresAt: days ? now + days * 86400000 : null };
}
