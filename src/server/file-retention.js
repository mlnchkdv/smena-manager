const RETENTION_MS = 30 * 86400000;

export async function sweepAbandonedUploads(options) {
  if (typeof options.storage.verifyResumableUpload !== 'function') return { scanned: 0, queued: 0 };
  const now = options.now || Date.now();
  const current = await options.load();
  const candidates = (current._pendingUploads || [])
    .filter(upload => now - upload.createdAt >= 2 * 86400000)
    .sort((a, b) => (a.lastCheckedAt || a.createdAt) - (b.lastCheckedAt || b.createdAt))
    .slice(0, 10);
  const verified = [];
  const expired = new Set();
  for (const upload of candidates) {
    // Verify the app marker, exact filename/size and uploads parent before retaining an orphan.
    const stored = await options.storage.verifyResumableUpload(upload.filename, upload.size, upload.marker, '');
    if (stored) verified.push({ upload, stored });
    else if (now - upload.createdAt >= 90 * 86400000) expired.add(upload.filename);
  }
  if (!candidates.length) return { scanned: 0, queued: 0 };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const latest = await options.load();
    try {
      let queued = 0;
      await options.mutate(database => {
        const references = referencedStorageFiles(database);
        for (const { upload, stored } of verified) {
          const file = { storageName: stored.filename, storageFileId: stored.fileId };
          if (!references.has(key(file))) {
            retainDetachedFile(database, file, now);
            queued += 1;
          }
          expired.add(upload.filename);
        }
        database._pendingUploads = (database._pendingUploads || []).filter(upload => !expired.has(upload.filename));
        const checked = new Set(candidates.map(upload => upload.filename));
        for (const upload of database._pendingUploads) if (checked.has(upload.filename)) upload.lastCheckedAt = now;
        return database;
      }, latest.revision);
      return { scanned: candidates.length, queued };
    } catch (error) {
      if (error.code !== 'REVISION_CONFLICT' || attempt === 2) throw error;
    }
  }
  return { scanned: candidates.length, queued: 0 };
}

function key(file) {
  return file?.storageFileId ? `id:${file.storageFileId}` : file?.storageName ? `name:${file.storageName}` : null;
}

export function referencedStorageFiles(data, result = new Set()) {
  if (!data || typeof data !== 'object') return result;
  if (key(data)) result.add(key(data));
  for (const [name, value] of Object.entries(data)) {
    if (name.startsWith('_')) continue;
    if (value && typeof value === 'object') referencedStorageFiles(value, result);
  }
  return result;
}

export function retainDetachedFile(database, file, now = Date.now()) {
  const id = key(file);
  if (!id || !file.storageName) return;
  const records = database._fileGc || [];
  database._fileGc = [
    ...records.filter(item => item.id !== id),
    {
      id,
      storageName: file.storageName,
      storageFileId: file.storageFileId || null,
      detachedAt: now,
      notBefore: now + RETENTION_MS,
    },
  ];
}

export async function collectRetainedFiles(options) {
  const current = await options.load();
  const pending = current._fileGc || [];
  const now = options.now || Date.now();
  if (!pending.some(item => item.notBefore <= now)) return { candidates: 0, removed: 0, failed: 0 };
  const references = referencedStorageFiles(current);
  // Fail closed: if any backup cannot be inspected, no physical file is deleted.
  for (const backup of await options.storage.listDatabaseBackups()) {
    referencedStorageFiles(await options.storage.loadDatabaseBackup(backup.id), references);
  }
  const candidates = pending.filter(item => item.notBefore <= now && !references.has(item.id)).slice(0, 10);
  if (options.dryRun) return { candidates: candidates.length, removed: 0, failed: 0 };
  const removed = new Set();
  let failed = 0;
  for (const file of candidates) {
    try {
      await options.storage.deleteFile(file.storageName, file.storageFileId);
      removed.add(file.id);
    } catch (error) {
      if (Number(error.statusCode || error.response?.status || error.code) === 404) removed.add(file.id);
      else failed += 1;
    }
  }
  if (removed.size) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const latest = await options.load();
      try {
        await options.mutate(database => {
          database._fileGc = (database._fileGc || []).filter(item => !removed.has(item.id));
          for (const id of removed) if (database._fileRegistry) delete database._fileRegistry[id];
          return database;
        }, latest.revision);
        break;
      } catch (error) {
        if (error.code !== 'REVISION_CONFLICT' || attempt === 2) throw error;
      }
    }
  }
  return { candidates: candidates.length, removed: removed.size, failed };
}
