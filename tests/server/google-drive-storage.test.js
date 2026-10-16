import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import test from 'node:test';
import { GoogleDriveStorageProvider } from '../../src/server/storage/google-drive.js';

test('Google Drive storage keeps uploads separate and supports ranged streams', async () => {
  const calls = [];
  const provider = new GoogleDriveStorageProvider();
  provider.initialized = true;
  provider.rootFolderId = 'root-folder';
  provider.uploadsFolderId = 'uploads-folder';
  provider.client = {
    files: {
      create: async options => {
        calls.push({ type: 'create', options });
        return { data: { id: 'drive-file', name: options.requestBody.name, size: '10', mimeType: options.media.mimeType } };
      },
      get: async (options, requestOptions) => {
        calls.push({ type: 'get', options, requestOptions });
        if (options.alt === 'media') return { data: Readable.from([Buffer.from('2345')]), headers: { 'content-length': '4' } };
        return { data: { id: 'drive-file', name: 'asset.txt', size: '10', mimeType: 'text/plain', trashed: false } };
      },
      delete: async options => {
        calls.push({ type: 'delete', options });
      },
    },
  };

  const uploaded = await provider.uploadFile('asset.txt', Buffer.from('0123456789'), 'text/plain');
  assert.deepEqual(uploaded, { fileId: 'drive-file', filename: 'asset.txt', size: 10, mimeType: 'text/plain', webViewLink: undefined });
  assert.deepEqual(calls[0].options.requestBody.parents, ['uploads-folder']);

  const ranged = await provider.openDownloadStream('asset.txt', 'drive-file', { start: 2, end: 5 });
  const chunks = [];
  for await (const chunk of ranged.stream) chunks.push(chunk);
  assert.equal(Buffer.concat(chunks).toString('utf8'), '2345');
  assert.equal(calls.at(-1).requestOptions.headers.Range, 'bytes=2-5');

  assert.equal(await provider.deleteFile('asset.txt', 'drive-file'), true);
  assert.equal(calls.at(-1).options.fileId, 'drive-file');
});

test('Google Drive database updates use the ETag loaded with the current revision', async () => {
  const calls = [];
  const provider = new GoogleDriveStorageProvider();
  provider.initialized = true;
  provider.rootFolderId = 'root-folder';
  provider.databaseFileId = 'database-file';
  provider.client = {
    files: {
      get: async () => ({ data: JSON.stringify({ revision: 4 }), headers: { etag: 'etag-4' } }),
      update: async (options, requestOptions) => {
        calls.push({ options, requestOptions });
        return { headers: { etag: 'etag-5' } };
      },
    },
  };

  assert.deepEqual(await provider.loadDatabase(), { revision: 4 });
  await provider.saveDatabase({ revision: 5 });

  assert.equal(calls[0].options.fileId, 'database-file');
  assert.equal(calls[0].requestOptions.headers['If-Match'], 'etag-4');
  assert.equal(provider.databaseEtag, 'etag-5');
});

test('Google Drive backups stay in the dedicated folder and can be restored', async () => {
  const provider = new GoogleDriveStorageProvider();
  provider.initialized = true;
  provider.rootFolderId = 'root-folder';
  provider.backupsFolderId = 'backups-folder';
  let createdRequest;
  provider.client = {
    files: {
      create: async options => {
        createdRequest = options;
        return {
          data: {
            id: 'backup-1',
            createdTime: '2026-10-16T12:00:00.000Z',
            size: '120',
            appProperties: { smenaBackup: 'true', label: 'Ручная копия' },
          },
        };
      },
      list: async () => ({
        data: {
          files: [
            {
              id: 'backup-1',
              createdTime: '2026-10-16T12:00:00.000Z',
              size: '120',
              appProperties: { smenaBackup: 'true', label: 'Ручная копия' },
            },
          ],
        },
      }),
      get: async options => {
        if (options.alt === 'media') {
          return { data: JSON.stringify({ data: { schemaVersion: 1, revision: 3, tasks: [] } }) };
        }
        return { data: { id: 'backup-1', parents: ['backups-folder'], trashed: false, appProperties: { smenaBackup: 'true' } } };
      },
    },
  };

  const created = await provider.createDatabaseBackup({ schemaVersion: 1, revision: 3, tasks: [] }, 'Ручная копия');
  assert.equal(created.id, 'backup-1');
  assert.deepEqual(createdRequest.requestBody.parents, ['backups-folder']);
  assert.equal((await provider.listDatabaseBackups())[0].label, 'Ручная копия');
  assert.deepEqual(await provider.loadDatabaseBackup('backup-1'), { schemaVersion: 1, revision: 3, tasks: [] });
});
