import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { GoogleDriveStorageProvider } from '../../src/server/storage/google-drive.js';

function fixture() {
  const provider = new GoogleDriveStorageProvider(),
    objects = new Map();
  provider.ensureBackupsFolder = async () => 'workspace-backups';
  provider.client = {
    files: {
      async list({ q }) {
        const parent = q.match(/'([^']+)' in parents/)[1],
          name = q.match(/name = '([^']+)'/)?.[1];
        const properties = [...q.matchAll(/key='([^']+)' and value='([^']+)'/g)];
        return {
          data: {
            files: [...objects.values()].filter(
              file =>
                !file.trashed &&
                file.parents.includes(parent) &&
                (!name || file.name === name) &&
                properties.every(([, key, value]) => file.appProperties[key] === value),
            ),
          },
        };
      },
      async get({ fileId, alt }) {
        const file = objects.get(fileId);
        if (!file) throw Error('File missing');
        return { data: alt === 'media' ? file.text : file };
      },
      async create({ requestBody, media }) {
        let text = '';
        for await (const chunk of media.body) text += chunk;
        const file = { ...requestBody, id: 'drive-' + objects.size, text, size: Buffer.byteLength(text), createdTime: '2026-11-07T00:00:00Z' };
        objects.set(file.id, file);
        return { data: file };
      },
      async delete({ fileId }) {
        objects.delete(fileId);
        return { data: {} };
      },
    },
  };
  return { provider, objects };
}

test('backup objects are content checked, parent scoped and separate from upload/body namespaces', async () => {
  const { provider, objects } = fixture(),
    text = '{"source":"exact"}',
    hash = createHash('sha256').update(text).digest('hex');
  await provider.writeWorkspaceBackupObject(text, hash);
  await provider.writeWorkspaceBackupObject(text, hash);
  assert.equal(objects.size, 1);
  const file = [...objects.values()][0];
  assert.deepEqual(file.parents, ['workspace-backups']);
  assert.deepEqual(file.appProperties, { smenaBackupObject: '1' });
  assert.equal(await provider.readWorkspaceBackupObject(hash), text);
  assert.deepEqual(await provider.listDatabaseBackups(), []);
  file.parents = ['another-workspace'];
  await assert.rejects(provider.readWorkspaceBackupObject(hash), /unavailable/);
  file.parents = ['workspace-backups'];
  file.text = 'corrupt';
  await assert.rejects(provider.readWorkspaceBackupObject(hash), /integrity/);
});

test('concurrent identical backup publication lists one copy and deletion cannot resurrect a duplicate', async () => {
  const { provider, objects } = fixture();
  const manifest = { format: 'smena-prepared-backup-v1', createdAt: '2026-11-07T00:00:00Z', label: 'One logical copy', bytes: 1024, source: {} };
  const results = await Promise.all([provider.publishWorkspaceBackup(manifest), provider.publishWorkspaceBackup(manifest)]);
  assert.equal(objects.size, 2, 'fixture reproduces Drive duplicate names');
  const listed = await provider.listDatabaseBackups();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].size, 1024);
  const retry = await provider.publishWorkspaceBackup(manifest);
  assert.ok(results.some(row => row.id === retry.id));
  assert.equal(objects.size, 2);
  await provider.deleteDatabaseBackup(listed[0].id);
  assert.equal(objects.size, 0);
  assert.deepEqual(await provider.listDatabaseBackups(), []);
});

test('a corrupt duplicate fails before any member of the logical copy is deleted', async () => {
  const { provider, objects } = fixture();
  const manifest = { format: 'smena-prepared-backup-v1', createdAt: '2026-11-07', label: 'Copy', bytes: 42, source: {} };
  await Promise.all([provider.publishWorkspaceBackup(manifest), provider.publishWorkspaceBackup(manifest)]);
  const listed = await provider.listDatabaseBackups();
  [...objects.values()][1].text = 'tampered';
  await assert.rejects(provider.deleteDatabaseBackup(listed[0].id), /integrity/);
  assert.equal(objects.size, 2);
});
