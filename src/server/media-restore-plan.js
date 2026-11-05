import { createHash } from 'node:crypto';
export const mediaRestoreRef = (id, index, project, folderId) => `${id}:${index}:${project}${folderId ? `:${folderId}` : ''}`;
export const mediaRestoreName = (id, index, project, folderId) =>
  `media-restore-${id}-${index}-${Buffer.from(project + (folderId ? `:${folderId}` : '')).toString('hex')}`;
export function mediaRestoreReviewKey(job, project, folderId) {
  return createHash('sha256')
    .update(JSON.stringify([job.id, project, folderId || null, job.entries.map(entry => [entry.file.id, entry.file.name, entry.copy])]))
    .digest('hex');
}
export function registeredMediaRestore(data, job, index, project, folderId, user) {
  const receipt = job.restores?.[mediaRestoreRef(job.id, index, project, folderId)];
  if (!receipt) return null;
  return (
    data.files.find(
      file =>
        file.id === receipt.fileId &&
        file.ownerId === user.id &&
        file.project === project &&
        (file.folderId || null) === (folderId || null) &&
        file.storageFileId === receipt.storageFileId &&
        file.storageName === receipt.storageName &&
        file.bytes === receipt.bytes,
    ) || null
  );
}
