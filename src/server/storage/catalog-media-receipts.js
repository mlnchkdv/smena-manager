import { isDeepStrictEqual as same } from 'node:util';
import { mediaRestoreRef, mediaRestoreName } from '../media-restore-plan.js';

const withoutReceipts = jobs =>
  jobs?.map(({ restores: _restores, ...job }) => {
    void _restores;
    return job;
  });
const invalid = () => Object.assign(Error('Invalid media restore receipt delta.'), { code: 'FILE_PATCH_FORBIDDEN', statusCode: 403 });

// A binary restore can atomically add its canonical receipt alongside new file
// rows. It cannot edit a job, erase receipts, or attach a receipt to old content.
export function assertCatalogMediaReceipts(before, after, added) {
  if (same(before, after)) return;
  if (!Array.isArray(before) || !Array.isArray(after) || !same(withoutReceipts(before), withoutReceipts(after))) throw invalid();
  const files = new Map(added.map(file => [file.id, file]));
  for (let i = 0; i < before.length; i++) {
    const old = before[i].restores || {},
      next = after[i].restores || {};
    if (Object.entries(old).some(([key, value]) => !same(value, next[key]))) throw invalid();
    for (const [ref, receipt] of Object.entries(next)) {
      if (Object.hasOwn(old, ref)) continue;
      const job = before[i],
        file = files.get(receipt?.fileId);
      const index = file && job.entries.findIndex((_entry, index) => mediaRestoreRef(job.id, index, file.project, file.folderId || null) === ref);
      if (
        !job.ready ||
        !file ||
        index < 0 ||
        file.mediaBackupRef !== ref ||
        file.storageName !== mediaRestoreName(job.id, index, file.project, file.folderId || null) ||
        receipt.storageName !== file.storageName ||
        receipt.storageFileId !== file.storageFileId ||
        receipt.bytes !== file.bytes ||
        receipt.ownerId !== file.ownerId ||
        file.bytes !== job.entries[index].copy?.bytes ||
        receipt.checksum !== job.entries[index].copy.checksum ||
        !Number.isFinite(receipt.at)
      )
        throw invalid();
      files.delete(file.id);
    }
  }
}
