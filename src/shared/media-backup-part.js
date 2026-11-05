export function mediaBackupPart(job, index) {
  if (!/^[a-f0-9-]{36}$/i.test(job?.id || '') || !Number.isInteger(index) || index < 0 || index > job.entries.length)
    throw new TypeError('Invalid backup part.');
  if (index === job.entries.length) return { name: `media-manifest-${job.id}.json`, manifest: true };
  const copy = job.entries[index]?.copy;
  if (!copy) return null;
  const name = `media-${job.id}-${index}`;
  if (copy.storageName !== name || !copy.storageFileId || !Number.isSafeInteger(copy.bytes) || copy.bytes < 1 || !copy.checksum)
    throw Object.assign(Error('Backup identity changed.'), { code: 'MEDIA_SOURCE_CHANGED', statusCode: 409 });
  return { ...copy, name };
}
