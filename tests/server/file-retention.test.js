import assert from 'node:assert/strict';
import test from 'node:test';
import { collectRetainedFiles, retainDetachedFile } from '../../src/server/file-retention.js';

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
