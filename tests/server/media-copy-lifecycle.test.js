import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { mediaBackupService } from '../../src/server/media-backups.js';
import { LocalStorageProvider } from '../../src/server/storage/local-storage.js';
import { mediaCopyArchived, mediaCopySettings } from '../../src/shared/media-copy-lifecycle.js';
import { mediaBackupPart } from '../../src/shared/media-backup-part.js';
import { GoogleDriveStorageProvider } from '../../src/server/storage/google-drive.js';

test('copy lifecycle frees active capacity without removing binaries and deletion requires ordered explicit confirmation', async () => {
  let clock = Date.now(),
    removed = [];
  let data = {
    revision: 0,
    me: 'm',
    members: [{ id: 'm', email: 'm@example.test', role: 'Member' }],
    projects: [{ id: 'p', members: ['m'] }],
    files: [{ id: 'f', name: 'original.txt', project: 'p', bytes: 2, storageName: 'source', storageFileId: 'source' }],
  };
  const user = { id: 'm', email: 'm@example.test', role: 'editor' };
  const service = mediaBackupService({
    now: () => clock,
    load: async () => structuredClone(data),
    mutate: async (fn, revision) => {
      assert.equal(revision, data.revision);
      data = fn(structuredClone(data));
      data.revision++;
    },
    storage: {
      copyMediaObject: async (file, name) => ({ storageName: name, storageFileId: name, bytes: file.bytes, checksum: 'verified' }),
      saveMediaManifest: async () => {},
      removeMediaBackupPart: async (_job, index) => {
        removed.push(index);
      },
    },
  });
  const jobs = [];
  for (let i = 0; i < 4; i++) jobs.push(await service.create(user, ['f'], { label: `Copy ${i}`, retentionDays: 7 }));
  await assert.rejects(service.create(user, ['f']), { code: 'MEDIA_BACKUP_LIMIT' });
  await service.advance(user, jobs[0].id);
  await service.settings(user, jobs[0].id, { archived: true });
  await service.create(user, ['f']);
  await assert.rejects(service.settings(user, jobs[0].id, { archived: false }), { code: 'MEDIA_BACKUP_LIMIT' });
  await assert.rejects(service.purge(user, jobs[0].id, 1, jobs[0].id));
  await assert.rejects(service.purge(user, jobs[0].id, 0, 'unconfirmed'));
  await service.purge(user, jobs[0].id, 0, jobs[0].id);
  await assert.rejects(service.inventory(user, jobs[0].id), { code: 'MEDIA_COPY_DELETING' });
  await service.purge(user, jobs[0].id, 1, jobs[0].id);
  assert.deepEqual(removed, [0, 1]);
  assert.equal(data.files.length, 1);
  assert.equal(data.files[0].storageName, 'source');
  clock += 8 * 86400000;
  assert.equal((await service.list(user)).filter(job => !job.archived).length, 1);
  assert.equal((await service.settings(user, jobs[1].id, { label: 'Renamed expired copy', retentionDays: 7 })).archived, true);
  assert.equal(mediaCopyArchived(mediaCopySettings({ label: 'Timed', retentionDays: 7 }, clock), clock), false);
  assert.throws(() => mediaCopySettings({ label: 'Bad', retentionDays: -1 }, clock));
  data.members[0].role = 'Guest';
  await assert.rejects(service.settings(user, jobs[1].id, { archived: true }));
});

test('Drive cleanup cannot trash an original, a changed checksum or an unowned manifest', async () => {
  const id = randomUUID(),
    copy = { storageFileId: 'copy', storageName: `media-${id}-0`, bytes: 2, checksum: 'verified', name: 'must-not-override' };
  const job = { id, entries: [{ copy }] };
  let file = { id: 'copy', name: copy.storageName, parents: ['backup'], size: '2', md5Checksum: 'verified' };
  const trashed = [];
  const storage = {
    init: async () => {},
    ensureBackupsFolder: async () => 'backup',
    client: {
      files: {
        get: async () => ({ data: file }),
        list: async () => ({ data: { files: [{ id: 'manifest' }] } }),
        update: async input => {
          assert.equal(input.requestBody.trashed, true);
          trashed.push(input.fileId);
        },
      },
    },
  };
  const remove = index => GoogleDriveStorageProvider.prototype.removeMediaBackupPart.call(storage, job, index);
  assert.equal(mediaBackupPart(job, 0).name, copy.storageName);
  file = { ...file, parents: ['uploads'] };
  await assert.rejects(remove(0), { code: 'MEDIA_SOURCE_CHANGED' });
  file = { ...file, parents: ['backup'], md5Checksum: 'changed' };
  await assert.rejects(remove(0), { code: 'MEDIA_SOURCE_CHANGED' });
  file = { ...file, md5Checksum: 'verified' };
  await remove(0);
  file = { id: 'manifest', name: `media-manifest-${id}.json`, parents: ['backup'] };
  await assert.rejects(remove(1), { code: 'MEDIA_SOURCE_CHANGED' });
  file.appProperties = { smenaMediaManifest: 'true' };
  await remove(1);
  assert.deepEqual(trashed, ['copy', 'manifest']);
});

test('local copy removal validates backup names and keeps originals and restored files', async t => {
  const base = path.resolve('.data/tests'),
    directory = path.join(base, `media-removal-${randomUUID()}`);
  assert.ok(directory.startsWith(base + path.sep));
  const storage = new LocalStorageProvider(path.join(directory, 'data.json'), {
    uploadsPath: path.join(directory, 'uploads'),
    backupsPath: path.join(directory, 'backups'),
  });
  t.after(async () => {
    assert.ok(directory.startsWith(base + path.sep));
    await fs.rm(directory, { recursive: true, force: true });
  });
  const source = Buffer.from('original');
  const uploaded = await storage.uploadFile('source.txt', source, 'text/plain');
  const id = randomUUID();
  const copy = await storage.copyMediaObject({ storageName: uploaded.filename, bytes: source.length }, `media-${id}-0`);
  const job = { id, entries: [{ copy }] };
  await storage.saveMediaManifest(job);
  await storage.copyMediaObject(copy, 'restored.txt', { fromBackup: true, toBackup: false });
  assert.throws(() => mediaBackupPart({ id, entries: [{ copy: { ...copy, storageName: 'source.txt' } }] }, 0));
  await storage.removeMediaBackupPart(job, 0);
  await storage.removeMediaBackupPart(job, 0);
  await storage.removeMediaBackupPart(job, 1);
  assert.deepEqual(await fs.readFile(storage.filePath('source.txt')), source);
  assert.deepEqual(await fs.readFile(storage.filePath('restored.txt')), source);
});
