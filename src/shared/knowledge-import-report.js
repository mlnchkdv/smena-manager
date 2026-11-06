const name = value =>
  String(value || '')
    .split(/[\\/]/)
    .at(-1)
    .slice(0, 512);
export function knowledgeImportReport(job, review, failure, at = new Date().toISOString()) {
  const rows = (job?.entries || review?.entries || []).map(entry => ({
    name: name(entry.name),
    status: entry.status || (failure?.key === entry.key ? 'failed' : 'pending'),
    ...(entry.noteId ? { noteId: entry.noteId } : {}),
    ...(failure?.key === entry.key ? { code: failure.code || 'REQUEST_FAILED' } : {}),
  }));
  rows.push(...(review?.errors || []).map(entry => ({ name: name(entry.name), status: 'excluded', reason: String(entry.error || '').slice(0, 512) })));
  return { format: 'smena-note-import-report', version: 1, at, jobId: job?.id || null, state: job?.state || 'review', rows };
}
