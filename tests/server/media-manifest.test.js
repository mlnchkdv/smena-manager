import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { mediaBackupService } from '../../src/server/media-backups.js';
import { LocalStorageProvider } from '../../src/server/storage/local-storage.js';
import { mediaManifestIdentity } from '../../src/shared/media-manifest.js';
import { GoogleDriveStorageProvider } from '../../src/server/storage/google-drive.js';

const user = { id: 'account', email: 'owner@example.test', role: 'admin' };
const database = () => ({ revision: 0, members: [{ id: 'm', email: user.email, role: 'Owner' }], projects: [{ id: 'p', members: ['m'] }], files: [] });
function store(storage, scope = 'default', resolveSource) {
  const state = { data: database() };
  state.service = mediaBackupService({
    storage,
    scope,
    resolveSource,
    load: async () => structuredClone(state.data),
    mutate: async (fn, revision) => {
      assert.equal(revision, state.data.revision);
      state.data = fn(structuredClone(state.data));
      state.data.revision++;
    },
  });
  return state;
}
async function fixture(t) {
  const root = path.resolve('.data/tests'),
    dir = path.join(root, `manifest-${randomUUID()}`);
  assert.ok(dir.startsWith(root + path.sep));
  t.after(async () => {
    assert.ok(dir.startsWith(root + path.sep));
    await fs.rm(dir, { recursive: true, force: true });
  });
  const provider = name => new LocalStorageProvider(path.join(dir, name, 'data.json'));
  const storage = provider('source'),
    state = store(storage);
  const bytes = Buffer.from('verified media for manifest recovery');
  const uploaded = await storage.uploadFile('source.txt', bytes);
  state.data.files = [{ id: 'f', name: 'source.txt', bytes: bytes.length, project: 'p', storageName: uploaded.filename, storageFileId: uploaded.fileId }];
  const job = await state.service.create(user, ['f']);
  await state.service.advance(user, job.id);
  const manifest = await state.service.manifest(user, job.id);
  await fs.unlink(storage.filePath('source.txt'));
  state.data.files = [];
  state.data._mediaBackups = [];
  return { state, storage, manifest, bytes, provider };
}

test('standalone manifest recovers a lost job and copies into another empty workspace with stable resumable identities', async t => {
  const { state, storage, manifest, bytes, provider } = await fixture(t);
  const revision = state.data.revision;
  const plan = await state.service.reviewManifest(user, manifest, 'default', 'p');
  assert.equal(plan.mode, 'rebind');
  assert.equal(plan.capacity.bytes, 0);
  assert.equal(state.data.revision, revision);
  const reconnected = await state.service.importManifest(user, manifest, 'default', 'p', null, plan.reviewKey);
  assert.equal(reconnected.id, manifest.id);
  await state.service.advance(user, reconnected.id);
  const restored = await state.service.restore(user, reconnected.id, 'p', 0);
  assert.deepEqual(await fs.readFile(storage.filePath(restored.storageName)), bytes);
  state.data._mediaBackups = []; // A second destination has no source job to consult.
  const destStorage = provider('destination');
  const destination = store(destStorage, randomUUID(), async () => ({ storage, data: state.data }));
  const cross = await destination.service.reviewManifest(user, manifest, 'default', 'p');
  assert.equal(cross.mode, 'copy');
  assert.equal(cross.capacity.bytes, bytes.length);
  const imported = await destination.service.importManifest(user, manifest, 'default', 'p', null, cross.reviewKey);
  assert.notEqual(imported.id, manifest.id);
  assert.equal((await destination.service.importManifest(user, manifest, 'default', 'p', null, cross.reviewKey)).id, imported.id);
  assert.equal((await destination.service.advance(user, imported.id)).ready, true);
  assert.equal((await destination.service.advance(user, imported.id)).ready, true);
  const file = await destination.service.restore(user, imported.id, 'p', 0);
  assert.deepEqual(await fs.readFile(destStorage.filePath(file.storageName)), bytes);
  assert.notEqual(file.storageName, restored.storageName);
  assert.equal((await destination.service.restore(user, imported.id, 'p', 0)).id, file.id);
});

test('manifest review rejects forged identities and current source revocation; a destination admin cannot grant source access', async t => {
  const { state, storage, manifest, provider } = await fixture(t);
  const dest = store(provider('destination'), randomUUID(), async () => ({ storage, data: state.data }));
  const forged = structuredClone(manifest);
  forged.entries[0].copy.storageFileId = 'someone-elses-object';
  await assert.rejects(dest.service.reviewManifest(user, forged, 'default', 'p'), { code: 'MEDIA_MANIFEST_UNAVAILABLE' });
  assert.equal(dest.data._mediaBackups, undefined);
  const plan = await dest.service.reviewManifest(user, manifest, 'default', 'p');
  const job = await dest.service.importManifest(user, manifest, 'default', 'p', null, plan.reviewKey);
  state.data.members[0].status = 'deactivated';
  await assert.rejects(dest.service.advance(user, job.id), { code: 'MEDIA_MANIFEST_UNAVAILABLE' });
  assert.equal(dest.data._mediaBackups[0].entries[0].copy, undefined);
  state.data.members[0].status = 'active';
  state.data.members[0].role = 'Member';
  state.data.projects[0] = { id: 'p', private: true, members: [] };
  await assert.rejects(dest.service.reviewManifest(user, manifest, 'default', 'p'));
  const malformed = structuredClone(manifest);
  malformed.entries[0].copy.storageName = '../escape';
  assert.throws(() => mediaManifestIdentity(malformed), { code: 'MEDIA_MANIFEST_INVALID' });
});

test('missing-core recovery uses only trusted original administrator ownership, never uploaded role claims', async t => {
  const { storage, manifest, provider } = await fixture(t);
  const dest = store(provider('destination'), randomUUID(), async () => ({ storage, data: null }));
  const plan = await dest.service.reviewManifest(user, manifest, 'default', 'p');
  assert.equal(plan.entries.length, 1);
  const legacy = { ...manifest, creatorRole: undefined };
  await storage.saveMediaManifest(legacy);
  const forged = { ...manifest, creatorRole: 'admin' };
  await assert.rejects(dest.service.reviewManifest(user, forged, 'default', 'p'), { code: 'MEDIA_MANIFEST_UNAVAILABLE' });
});

test('changed binary is shown as unavailable in read-only review and never creates a job', async t => {
  const { state, storage, manifest } = await fixture(t);
  const file = path.join(storage.backupsPath, 'media', manifest.entries[0].copy.storageName);
  await fs.writeFile(file, 'corrupt');
  const revision = state.data.revision;
  const plan = await state.service.reviewManifest(user, manifest, 'default', 'p');
  assert.equal(plan.available, false);
  assert.equal(plan.entries[0].available, false);
  await assert.rejects(state.service.importManifest(user, manifest, 'default', 'p', null, plan.reviewKey), { code: 'MEDIA_MANIFEST_UNAVAILABLE' });
  assert.equal(state.data.revision, revision);
  assert.deepEqual(state.data._mediaBackups, []);
});

test('Drive reads only one marked manifest under the configured backup folder', async () => {
  const id = randomUUID();
  let item = { id: 'manifest', size: '20', appProperties: { smenaMediaManifest: 'true' } },
    reads = 0;
  const storage = {
    init: async () => {},
    ensureBackupsFolder: async () => 'expected',
    client: {
      files: {
        list: async input => {
          assert.ok(input.q.includes("'expected' in parents"));
          return { data: { files: [item] } };
        },
        get: async () => {
          reads++;
          return { data: { id } };
        },
      },
    },
  };
  const read = () => GoogleDriveStorageProvider.prototype.readMediaManifest.call(storage, id);
  assert.equal((await read()).id, id);
  item = { ...item, appProperties: {} };
  await assert.rejects(read(), { code: 'MEDIA_MANIFEST_UNAVAILABLE' });
  assert.equal(reads, 1);
});
