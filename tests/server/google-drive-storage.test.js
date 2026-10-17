import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import test from 'node:test';
import { GoogleDriveStorageProvider } from '../../src/server/storage/google-drive.js';
import { storageVersion } from '../../src/server/storage/version-token.js';

test('Google Drive status includes account storage quota when available', async () => {
  const provider = new GoogleDriveStorageProvider();
  provider.initialized = true;
  provider.rootFolderId = 'root-folder';
  provider.uploadsFolderId = 'uploads-folder';
  provider.databaseFileId = 'database-file';
  provider.client = {
    about: {
      get: async options => {
        assert.equal(options.fields, 'storageQuota');
        return {
          data: {
            storageQuota: {
              usage: '139100000',
              limit: '5000000000000',
              usageInDrive: '120000000',
              usageInDriveTrash: '1000000',
            },
          },
        };
      },
    },
  };

  const status = await provider.getStatus();
  assert.equal(status.databaseReady, true);
  assert.equal(status.usageBytes, 139100000);
  assert.equal(status.quotaBytes, 5000000000000);
  assert.equal(status.driveUsageBytes, 120000000);
  assert.equal(status.trashUsageBytes, 1000000);
});

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
        return { data: { id: 'drive-file', name: 'asset.txt', size: '10', mimeType: 'text/plain', trashed: false, parents: ['uploads-folder'] } };
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

test('Google Drive creates and verifies a scoped resumable upload session', async () => {
  const provider = new GoogleDriveStorageProvider();
  provider.initialized = true;
  provider.rootFolderId = 'root-folder';
  provider.uploadsFolderId = 'uploads-folder';
  provider.authClient = { getAccessToken: async () => ({ token: 'drive-token' }) };
  let initiated;
  provider.fetch = async (url, options) => {
    initiated = { url: String(url), options };
    return { ok: true, status: 200, headers: new Headers({ location: 'https://www.googleapis.com/upload/session-1' }) };
  };
  provider.client = {
    files: {
      list: async options => ({
        data: {
          files: [
            {
              id: 'drive-file',
              name: 'stored.pdf',
              size: '5242880',
              mimeType: 'application/pdf',
              parents: ['uploads-folder'],
              trashed: false,
              appProperties: { smenaUpload: 'marker-1' },
            },
          ],
        },
        options,
      }),
    },
  };

  const session = await provider.createResumableUpload('stored.pdf', 5 * 1024 * 1024, 'application/pdf', 'marker-1');
  assert.equal(session.uploadUrl, 'https://www.googleapis.com/upload/session-1');
  assert.match(initiated.url, /uploadType=resumable/);
  assert.equal(initiated.options.headers.Authorization, 'Bearer drive-token');
  assert.deepEqual(JSON.parse(initiated.options.body).parents, ['uploads-folder']);

  const verified = await provider.verifyResumableUpload('stored.pdf', 5 * 1024 * 1024, 'marker-1');
  assert.deepEqual(verified, {
    fileId: 'drive-file',
    filename: 'stored.pdf',
    size: 5 * 1024 * 1024,
    mimeType: 'application/pdf',
  });
  assert.equal(await provider.verifyResumableUpload('stored.pdf', 5 * 1024 * 1024, 'wrong-marker'), null);
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
  assert.equal(calls[0].options.requestBody.appProperties.smenaRevision, '5');
  assert.equal(calls[0].requestOptions.headers['If-Match'], 'etag-4');
  assert.equal(provider.databaseEtag, 'etag-5');
});

test('Google Drive reads the database revision from file metadata without downloading JSON', async () => {
  const calls = [];
  const provider = new GoogleDriveStorageProvider();
  provider.initialized = true;
  provider.rootFolderId = 'root-folder';
  provider.databaseFileId = 'database-file';
  provider.client = {
    files: {
      get: async options => {
        calls.push(options);
        return {
          data: {
            id: 'database-file',
            modifiedTime: '2026-10-16T08:00:00.000Z',
            version: '12',
            appProperties: { smenaRevision: '7' },
          },
          headers: { etag: 'etag-7' },
        };
      },
    },
  };

  assert.deepEqual(await provider.getDatabaseVersion(), {
    revision: 7,
    updatedAt: '2026-10-16T08:00:00.000Z',
    version: '12',
  });
  assert.equal(calls[0].alt, undefined);
  assert.match(calls[0].fields, /appProperties/);
  assert.equal(provider.databaseEtag, null);
});

test('concurrent reads and metadata probes cannot upgrade a stale writer ETag', async () => {
  const provider = new GoogleDriveStorageProvider();
  provider.initialized = true;
  provider.databaseFileId = 'database';
  let revision = 4;
  const writes = [];
  provider.client = {
    files: {
      get: async options => ({
        data: options.alt === 'media' ? JSON.stringify({ revision }) : { appProperties: { smenaRevision: String(revision) } },
        headers: { etag: `etag-${revision}` },
      }),
      update: async (options, request) => {
        writes.push(request.headers['If-Match']);
        if (request.headers['If-Match'] !== `etag-${revision}`) throw Object.assign(new Error('Precondition failed'), { code: 412 });
        return { headers: { etag: `etag-${++revision}` } };
      },
    },
  };
  const stale = await provider.loadDatabase();
  revision = 5;
  await provider.getDatabaseVersion();
  await provider.loadDatabase();
  await assert.rejects(provider.saveDatabase({ revision: 5 }, { expectedEtag: storageVersion(stale) }), { code: 412 });
  assert.deepEqual(writes, ['etag-4']);
  await assert.rejects(provider.saveDatabase({ revision: 6 }, { expectedEtag: null }), { code: 'STORAGE_VERSION_MISSING' });
});

test('Google Drive stores authentication sessions in a private sibling JSON file', async () => {
  const calls = [];
  const provider = new GoogleDriveStorageProvider();
  provider.initialized = true;
  provider.rootFolderId = 'root-folder';
  provider.client = {
    files: {
      list: async () => ({ data: { files: [{ id: 'auth-sessions-file' }] } }),
      get: async () => ({
        data: JSON.stringify([{ id: 'session-1', userId: 'member-1' }]),
        headers: { etag: 'etag-session-1' },
      }),
      update: async (options, requestOptions) => {
        calls.push({ options, requestOptions });
        return { headers: { etag: 'etag-session-2' } };
      },
    },
  };

  assert.deepEqual(await provider.loadAuthSessions(), [{ id: 'session-1', userId: 'member-1' }]);
  await provider.saveAuthSessions([{ id: 'session-2', userId: 'member-1' }]);

  assert.equal(calls[0].options.fileId, 'auth-sessions-file');
  assert.equal(calls[0].requestOptions.headers['If-Match'], 'etag-session-1');
  assert.equal(provider.authSessionsEtag, 'etag-session-2');
});

test('Google Drive stores push subscriptions in a private sibling JSON file', async () => {
  const calls = [];
  const provider = new GoogleDriveStorageProvider();
  provider.initialized = true;
  provider.rootFolderId = 'root-folder';
  provider.client = {
    files: {
      list: async options => {
        calls.push({ type: 'list', options });
        return { data: { files: [] } };
      },
      create: async options => {
        calls.push({ type: 'create', options });
        return { data: { id: 'push-file' }, headers: { etag: 'push-etag' } };
      },
    },
  };

  assert.deepEqual(await provider.loadPushSubscriptions(), []);
  await provider.savePushSubscriptions([{ id: 'browser-1' }]);

  const created = calls.find(call => call.type === 'create').options;
  assert.equal(created.requestBody.name, 'smena-manager-push-subscriptions.json');
  assert.equal(created.requestBody.appProperties.smenaPrivate, 'push-subscriptions');
  assert.deepEqual(created.requestBody.parents, ['root-folder']);
  assert.equal(provider.pushSubscriptionsFileId, 'push-file');
});

test('Google Drive stores notification delivery diagnostics as private metadata', async () => {
  const calls = [];
  const provider = new GoogleDriveStorageProvider();
  provider.initialized = true;
  provider.rootFolderId = 'root-folder';
  provider.client = {
    files: {
      list: async options => {
        calls.push({ type: 'list', options });
        return { data: { files: [] } };
      },
      create: async options => {
        calls.push({ type: 'create', options });
        return { data: { id: 'delivery-file' }, headers: { etag: 'delivery-etag' } };
      },
    },
  };

  assert.equal(await provider.loadNotificationDeliveryStatus(), null);
  await provider.saveNotificationDeliveryStatus({ version: 1, updatedAt: '2026-10-17T12:00:00.000Z' });

  const created = calls.find(call => call.type === 'create').options;
  assert.equal(created.requestBody.name, 'smena-manager-notification-delivery.json');
  assert.equal(created.requestBody.appProperties.smenaPrivate, 'notification-delivery');
  assert.deepEqual(created.requestBody.parents, ['root-folder']);
  assert.equal(provider.notificationDeliveryFileId, 'delivery-file');
});

test('Google Drive backups stay in the dedicated folder and can be restored', async () => {
  const provider = new GoogleDriveStorageProvider();
  provider.initialized = true;
  provider.rootFolderId = 'root-folder';
  provider.backupsFolderId = 'backups-folder';
  let createdRequest;
  let deletedRequest;
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
      delete: async options => {
        deletedRequest = options;
      },
    },
  };

  const created = await provider.createDatabaseBackup({ schemaVersion: 1, revision: 3, tasks: [] }, 'Ручная копия');
  assert.equal(created.id, 'backup-1');
  assert.deepEqual(createdRequest.requestBody.parents, ['backups-folder']);
  assert.equal((await provider.listDatabaseBackups())[0].label, 'Ручная копия');
  assert.deepEqual(await provider.loadDatabaseBackup('backup-1'), { schemaVersion: 1, revision: 3, tasks: [] });
  await provider.deleteDatabaseBackup('backup-1');
  assert.equal(deletedRequest.fileId, 'backup-1');
});
