import { activeFileFolder, fileFolderPath } from './file-organization.js';

export function uploadDestination(job, project, task) {
  const missing = !!job.folderId && !activeFileFolder(project, job.folderId);
  const path = missing
    ? job.destinationPath || [project?.name || job.project, job.folderId].join(' / ')
    : [project?.name || job.project, ...fileFolderPath(project, job.folderId).map(folder => folder.name)].join(' / ');
  return { path, missing, task: task?.title || job.task || '', key: JSON.stringify([job.batchId || '', job.project, job.folderId || '', job.task || '']) };
}

// A provider ticket is bound to its original context. Changing destination is
// an explicit fresh transfer, never a replay of the old completion ticket.
export function restartUploadDestination(job, folderId, project) {
  if (!job.file || job.running || job.sourceChecking || !['paused', 'failed', 'needs-file'].includes(job.phase)) throw new Error('UPLOAD_SOURCE_REQUIRED');
  if (folderId && !activeFileFolder(project, folderId)) throw new Error('FILE_FOLDER_INVALID');
  Object.assign(job, {
    folderId: folderId || null,
    session: null,
    accepted: 0,
    pct: 0,
    error: '',
    code: '',
    retryCount: 0,
    phase: 'paused',
    restorePhase: 'paused',
  });
  job.destinationPath = uploadDestination(job, project).path;
}
