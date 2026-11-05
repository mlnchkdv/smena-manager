import test from 'node:test';
import assert from 'node:assert/strict';
import { mediaBackupService } from '../../src/server/media-backups.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { LocalStorageProvider } from '../../src/server/storage/local-storage.js';
test('independent binary copy survives original removal and rejects a changed checksum', async t => {
  const base = path.resolve('.data/tests'),
    directory = path.join(base, `media-copy-${process.pid}`);
  assert.ok(directory.startsWith(base + path.sep));
  const storage = new LocalStorageProvider(path.join(directory, 'data.json'), {
    uploadsPath: path.join(directory, 'uploads'),
    backupsPath: path.join(directory, 'backups'),
  });
  t.after(async () => {
    assert.ok(directory.startsWith(base + path.sep));
    await fs.rm(directory, { recursive: true, force: true });
  });
  const source = Buffer.from('original media bytes');
  const uploaded = await storage.uploadFile('source.mp4', source, 'video/mp4');
  const copy = await storage.copyMediaObject({ storageName: uploaded.filename, storageFileId: uploaded.fileId, bytes: source.length }, 'media-copy');
  await fs.unlink(storage.filePath('source.mp4'));
  const restored = await storage.copyMediaObject(copy, 'restored.mp4', { fromBackup: true, toBackup: false });
  assert.deepEqual(await fs.readFile(storage.filePath(restored.storageName)), source);
  await assert.rejects(storage.copyMediaObject({ ...copy, checksum: 'changed' }, 'bad.mp4', { fromBackup: true, toBackup: false }));
});
test('large independent copies restore as new identities and recheck membership without reading bytes into memory', async () => {
  let data = {
    revision: 0,
    me: 'm',
    members: [{ id: 'm', email: 'm@example.test', role: 'Member' }],
    projects: [
      { id: 'p', members: ['m'] },
      { id: 'target', members: ['m'] },
    ],
    files: [{ id: 'f', project: 'p', name: 'long.mp4', bytes: 20 * 1024 ** 3, storageName: 'source', storageFileId: 'source-id', mimeType: 'video/mp4' }],
  };
  let calls = 0,
    manifest;
  const user = { id: 'm', email: 'm@example.test', role: 'editor' };
  const service = mediaBackupService({
    load: async () => structuredClone(data),
    mutate: async (fn, revision) => {
      assert.equal(revision, data.revision);
      data = fn(structuredClone(data));
      data.revision++;
    },
    storage: {
      copyMediaObject: async (file, name) => {
        calls++;
        return { storageName: name, storageFileId: name, bytes: file.bytes, checksum: 'verified' };
      },
      saveMediaManifest: async job => {
        manifest = job;
      },
    },
  });
  const job = await service.create(user, ['f']);
  assert.equal((await service.advance(user, job.id)).ready, true);
  assert.equal(manifest.ready, true);
  assert.equal(manifest.entries[0].copy.bytes, 20 * 1024 ** 3);
  data.files = []; // The original no longer exists; the separate copy still restores.
  data.files.push({ id: 'forged', mediaBackupRef: `${job.id}:0:target`, project: 'p', storageName: 'unrelated' });
  const restored = await service.restore(user, job.id, 'target', 0);
  assert.notEqual(restored.id, 'f');
  assert.notEqual(restored.id, 'forged');
  assert.equal(restored.project, 'target');
  assert.equal((await service.restore(user, job.id, 'target', 0)).id, restored.id);
  assert.deepEqual(await service.list({ ...user, id: 'other', email: 'other@example.test' }), []);
  data.members[0].status = 'deactivated';
  await assert.rejects(service.restore(user, job.id, 'target', 0));
  assert.equal(calls, 2);
});

test('restore review is read-only, checks quota and folder access, and resumes registered steps after refresh', async () => {
  let data = {
    revision: 0,
    me: 'm',
    members: [{ id: 'm', email: 'm@example.test', role: 'Member' }],
    projects: [{ id: 'p', members: ['m'], fileFolders: [{ id: 'folder', name: 'Destination' }] }],
    files: [{ id: 'f', project: 'p', name: 'photo.png', bytes: 2, storageName: 'source', storageFileId: 'source', mimeType: 'image/png' }],
  };
  let copies = 0,
    available = 100;
  const user = { id: 'm', email: 'm@example.test', role: 'editor' };
  const service = mediaBackupService({
    load: async () => structuredClone(data),
    mutate: async (fn, revision) => {
      assert.equal(revision, data.revision);
      data = fn(structuredClone(data));
      data.revision++;
    },
    storage: {
      getStatus: async () => ({ quotaBytes: 100, usageBytes: 100 - available }),
      copyMediaObject: async (file, name) => {
        copies++;
        return { storageFileId: name, storageName: name, bytes: file.bytes, checksum: 'verified' };
      },
      saveMediaManifest: async () => {},
    },
  });
  const job = await service.create(user, ['f']);
  await service.advance(user, job.id);
  const revision = data.revision;
  const plan = await service.restorePlan(user, job.id, 'p', 'folder');
  assert.equal(data.revision, revision);
  assert.equal(copies, 1);
  assert.equal(plan.capacity.bytes, 2);
  assert.equal(plan.entries[0].registered, false);
  await assert.rejects(service.restorePlan(user, job.id, 'p', 'missing'), { code: 'FILE_FOLDER_INVALID' });
  available = 0;
  assert.equal((await service.restorePlan(user, job.id, 'p', 'folder')).capacity.sufficient, false);
  await assert.rejects(service.restore(user, job.id, 'p', 0, { folderId: 'folder', reviewKey: plan.reviewKey }), { code: 'MEDIA_RESTORE_QUOTA' });
  assert.equal(copies, 1);
  available = 100;
  await assert.rejects(service.restore(user, job.id, 'p', 0, { folderId: 'folder', reviewKey: 'changed' }), { code: 'MEDIA_RESTORE_REVIEW_CHANGED' });
  const file = await service.restore(user, job.id, 'p', 0, { folderId: 'folder', reviewKey: plan.reviewKey });
  assert.equal(file.folderId, 'folder');
  const resumed = await service.restorePlan(user, job.id, 'p', 'folder');
  assert.equal(resumed.entries[0].registered, true);
  assert.equal(resumed.capacity.bytes, 0);
  assert.equal((await service.restore(user, job.id, 'p', 0, { folderId: 'folder', reviewKey: resumed.reviewKey })).id, file.id);
  assert.equal(copies, 2);
  data.projects[0].fileFolders[0].archived = true;
  await assert.rejects(service.restore(user, job.id, 'p', 0, { folderId: 'folder', reviewKey: resumed.reviewKey }), { code: 'FILE_FOLDER_INVALID' });
});
