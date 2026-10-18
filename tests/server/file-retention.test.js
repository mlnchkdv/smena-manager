import assert from 'node:assert/strict';
import test from 'node:test';
import { collectRetainedFiles, retainDetachedFile, sweepAbandonedUploads } from '../../src/server/file-retention.js';

test('abandoned uploads are verified and retained before cleanup, never deleted during the sweep', async () => {
  const now = 10 * 86400000;
  let state = {
    revision: 1,
    files: [],
    _pendingUploads: [
      { filename: 'orphan.txt', marker: 'app-only', size: 10, createdAt: 1 },
      { filename: 'unfinished.txt', marker: 'empty', size: 10, createdAt: 1 },
    ],
  };
  const result = await sweepAbandonedUploads({
    now,
    load: async () => structuredClone(state),
    mutate: async change => {
      state = change(structuredClone(state));
      return state;
    },
    storage: {
      verifyResumableUpload: async (filename, size, marker) => {
        assert.equal(size, 10);
        if (marker === 'empty') return null;
        assert.equal(marker, 'app-only');
        return { fileId: 'orphan-id', filename };
      },
      deleteFile: () => {
        throw new Error('Immediate deletion is forbidden');
      },
    },
  });
  assert.equal(result.queued, 1);
  assert.equal(state._pendingUploads.length, 1);
  assert.equal(state._pendingUploads[0].lastCheckedAt, now);
  assert.ok(state._fileGc[0].notBefore >= now + 30 * 86400000);
});

test('physical files survive duplicate links and backups, and expire only after retention without references', async () => {
  const file = { id: 'f', storageFileId: 'physical', storageName: 'blob.txt' };
  let state = { revision: 1, files: [{ ...file, id: 'alias' }], trash: [] };
  retainDetachedFile(state, file, 1);
  let backups = [{ id: 'backup' }];
  const deleted = [];
  const options = {
    now: 31 * 86400000,
    load: async () => structuredClone(state),
    mutate: async change => {
      state = change(structuredClone(state));
      return state;
    },
    storage: {
      listDatabaseBackups: async () => backups,
      loadDatabaseBackup: async () => ({ files: [file] }),
      deleteFile: async (name, id) => deleted.push([name, id]),
    },
  };
  assert.equal((await collectRetainedFiles(options)).removed, 0);
  state.files = [];
  assert.equal((await collectRetainedFiles(options)).removed, 0);
  backups = [];
  assert.equal((await collectRetainedFiles({ ...options, now: 2 })).removed, 0);
  assert.equal((await collectRetainedFiles({ ...options, dryRun: true })).candidates, 1);
  assert.equal(deleted.length, 0);
  assert.equal((await collectRetainedFiles(options)).removed, 1);
  assert.deepEqual(deleted, [['blob.txt', 'physical']]);
  assert.deepEqual(state._fileGc, []);
});

test('a backup read failure prevents all physical cleanup', async () => {
  const state = { files: [] };
  retainDetachedFile(state, { storageFileId: 'physical', storageName: 'blob' }, 1);
  let deletes = 0;
  await assert.rejects(
    collectRetainedFiles({
      load: async () => state,
      now: 31 * 86400000,
      storage: {
        listDatabaseBackups: async () => [{ id: 'broken' }],
        loadDatabaseBackup: async () => {
          throw new Error('Backup unavailable');
        },
        deleteFile: async () => deletes++,
      },
    }),
    /Backup unavailable/u,
  );
  assert.equal(deletes, 0);
});
