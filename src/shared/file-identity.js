// A display name is not an identity: different uploads may share the same name.
export function sameFileReference(left, right) {
  if (!left || !right) return false;
  if (left.id && right.id) return left.id === right.id;
  if (left.storageFileId && right.storageFileId) return left.storageFileId === right.storageFileId;
  if (left.storageName && right.storageName) return left.storageName === right.storageName;
  return false;
}

export function detachTaskFile(task, file) {
  if (!task || !file) return null;
  const attachments = task.attachments || [];
  const removed = attachments.find(item => sameFileReference(item, file)) || null;
  task.attachments = attachments.filter(item => !sameFileReference(item, file));
  return removed;
}
