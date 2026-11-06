import test from 'node:test';
import assert from 'node:assert/strict';
import { assertCatalogMediaReceipts } from '../../src/server/storage/catalog-media-receipts.js';
import { mediaRestoreRef, mediaRestoreName } from '../../src/server/media-restore-plan.js';
import { mediaBackupStore } from '../../src/server/media-backup-store.js';

test('a scoped restore receipt cannot edit jobs, erase progress or refer to an unrelated file', () => {
  const before = [{ id: 'copy', ready: true, owner: 'account', entries: [{ copy: { bytes: 2, checksum: 'verified' } }] }];
  const ref = mediaRestoreRef('copy', 0, 'p', null);
  const file = {
    id: 'f',
    project: 'p',
    ownerId: 'account',
    bytes: 2,
    storageName: mediaRestoreName('copy', 0, 'p', null),
    storageFileId: 'physical',
    mediaBackupRef: ref,
  };
  const receipt = { fileId: 'f', storageFileId: 'physical', storageName: file.storageName, bytes: 2, checksum: 'verified', ownerId: 'account', at: Date.now() };
  const after = [{ ...before[0], restores: { [ref]: receipt } }];
  assertCatalogMediaReceipts(before, after, [file]);
  for (const change of [
    n => (n[0].owner = 'other'),
    n => (n[0].restores[ref].checksum = 'forged'),
    n => (n[0].restores[ref].fileId = 'old-file'),
    n => (n[0].restores[ref].bytes = 3),
  ]) {
    const forged = structuredClone(after);
    change(forged);
    assert.throws(() => assertCatalogMediaReceipts(before, forged, [file]), { code: 'FILE_PATCH_FORBIDDEN' });
  }
  assert.throws(() => assertCatalogMediaReceipts(before, after, []), { code: 'FILE_PATCH_FORBIDDEN' });
  assert.throws(() => assertCatalogMediaReceipts(after, before, [file]), { code: 'FILE_PATCH_FORBIDDEN' });
});

test('selected records from a different revision never reach a metadata write', async () => {
  let writes = 0;
  const store = mediaBackupStore({ files: async () => ({ revision: 4, files: [{ id: 'f' }] }), metadata: async () => writes++ });
  await assert.rejects(
    store.mutate(data => data, 3, { readIds: ['f'], user: { id: 'm' } }),
    { code: 'REVISION_CONFLICT' },
  );
  assert.equal(writes, 0);
});
