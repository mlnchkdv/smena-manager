const name = value =>
  String(value || '')
    .split(/[\\/]/)
    .at(-1)
    .slice(0, 512);
const preparationCodes = new Set([
  'BACKUP_PREPARATION_INTEGRITY',
  'KNOWLEDGE_IMPORT_BACKUP_FAILED',
  'STORAGE_UNAVAILABLE',
  'RATE_LIMITED',
  'REVISION_CONFLICT',
  'REQUEST_FAILED',
  'EPERM',
  'EACCES',
  'EBUSY',
]);
export function knowledgeImportReport(job, review, failure, at = new Date().toISOString()) {
  const failed = entry => failure?.phase !== 'preparation' && typeof failure?.key === 'string' && failure.key === entry.key;
  const rows = (job?.entries || review?.entries || []).map(entry => ({
    name: name(entry.name),
    status: entry.status || (failed(entry) ? 'failed' : 'pending'),
    ...(entry.noteId ? { noteId: entry.noteId } : {}),
    ...(failed(entry) ? { code: failure.code || 'REQUEST_FAILED' } : {}),
  }));
  rows.push(...(review?.errors || []).map(entry => ({ name: name(entry.name), status: 'excluded', reason: String(entry.error || '').slice(0, 512) })));
  return {
    format: 'smena-note-import-report',
    version: 1,
    at,
    jobId: job?.id || null,
    state: job?.state || 'review',
    ...(job?.backupProgress
      ? {
          preparation: {
            verifiedObjects: job.backupProgress.copied,
            ...(failure?.phase === 'preparation' ? { code: preparationCodes.has(failure.code) ? failure.code : 'REQUEST_FAILED' } : {}),
          },
        }
      : {}),
    rows,
  };
}
