export const physicalFileKey = file => (file?.storageFileId ? `id:${file.storageFileId}` : file?.storageName ? `name:${file.storageName}` : null);

export function registerFileMetadata(database, file, verified = false) {
  const key = physicalFileKey(file);
  if (!key || !file.storageName) return null;
  database._fileRegistry ||= {};
  const record = {
    storageFileId: file.storageFileId || null,
    storageName: file.storageName,
    bytes: file.bytes == null ? null : Number(file.bytes),
    mimeType: file.mimeType || null,
  };
  const previous = database._fileRegistry[key];
  if (
    previous &&
    ['storageFileId', 'storageName', 'bytes', 'mimeType'].some(field => previous[field] != null && record[field] != null && previous[field] !== record[field])
  )
    throw Object.assign(new Error('Physical file metadata conflicts with its server registry.'), { statusCode: 409, code: 'FILE_METADATA_CONFLICT' });
  database._fileRegistry[key] = { ...record, ...previous, verified: Boolean(verified || previous?.verified) };
  return database._fileRegistry[key];
}

export function indexStoredFiles(database) {
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    if (value.storageName) registerFileMetadata(database, value);
    for (const [key, child] of Object.entries(value)) if (!key.startsWith('_') && child && typeof child === 'object') visit(child);
  };
  visit(database);
  return database;
}
