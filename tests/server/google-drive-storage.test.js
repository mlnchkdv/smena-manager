import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { GoogleDriveStorageProvider, assertMetadataBootstrapAllowed, uniqueDriveMatch } from '../../src/server/storage/google-drive.js';
import { storageVersion } from '../../src/server/storage/version-token.js';
import { rememberStorageVersion } from '../../src/server/storage/version-token.js';

test('immutable catalog cache is byte-bounded, checksum-keyed and never caches corrupt downloads', async () => {
  const provider = new GoogleDriveStorageProvider();
  let reads = 0,
    corrupt = false;
  const text = 'x'.repeat(2 * 1024 * 1024);
  const part = { bytes: Buffer.byteLength(text), sha256: createHash('sha256').update(text).digest('hex') };
  provider.client = {
    files: {
      get: async () => {
        reads++;
        return { data: corrupt ? 'bad' : text };
      },
    },
  };
  await Promise.all([provider.readCatalogPart('same', part), provider.readCatalogPart('same', part)]);
  assert.equal(provider.catalogPartBytes, part.bytes, 'Concurrent reads cannot double-charge an entry');
  await provider.readCatalogPart('same', part);
  assert.equal(reads, 2);
  for (let i = 0; i < 5; i++) await provider.readCatalogPart(`part-${i}`, part);
  assert.equal(provider.catalogParts.size, 4);
  assert.equal(provider.catalogPartBytes, 8 * 1024 * 1024);
  corrupt = true;
  const different = { ...part, sha256: '0'.repeat(64) };
  await provider.readCatalogPart('part-4', different);
  await provider.readCatalogPart('part-4', different);
  assert.equal(reads, 9, 'Changed digest and corrupt responses must not reuse cached bytes');
  assert.equal(provider.catalogParts.has(`part-4:${different.sha256}`), false);
});

test('operator rollback materializes the latest edits, creates a backup and fences the layout-only write', async () => {
  const provider = new GoogleDriveStorageProvider();
  const latest = rememberStorageVersion({ schemaVersion: 3, revision: 19, files: [{ id: 'new-after-migration', project: 'p', name: 'Latest' }] }, '"latest"');
  provider.loadDatabase = async () => latest;
  let backedUp = false,
    written;
  provider.createDatabaseBackup = async data => {
    assert.deepEqual(data, latest);
    backedUp = true;
    return { id: 'backup' };
  };
  provider.saveDatabase = async (data, options) => {
    assert.equal(backedUp, true);
    assert.equal(options.expectedEtag, '"latest"');
    written = data;
  };
  await assert.rejects(provider.setFileCatalogLayout('aggregate', 18), { code: 'REVISION_CONFLICT' });
  assert.equal(backedUp, false);
  await provider.setFileCatalogLayout('aggregate', 19);
  assert.deepEqual(written.files, latest.files);
  assert.equal(written._catalogLayout, 'aggregate');
  assert.equal(written.schemaVersion, 3, 'Old deployed writers must remain rejected after rollback');
});

test('schema 3 publishes immutable catalog parts before one fenced root update and backs up legacy data', async () => {
  const provider = new GoogleDriveStorageProvider();
  provider.initialized = true;
  provider.rootFolderId = 'root';
  provider.databaseFileId = 'db';
  provider.databaseEtag = '"old"';
  provider.catalogRoot = { schemaVersion: 2, revision: 1, files: [{ id: 'f', project: 'p', name: 'Old' }] };
  const parts = new Map();
  const reads = [];
  let root,
    backups = 0,
    failRoot = false;
  provider.createDatabaseBackup = async data => {
    assert.equal(data.files[0].name, 'Old');
    backups += 1;
  };
  provider.client = {
    files: {
      create: async params => {
        const id = `part-${parts.size}`;
        const chunks = [];
        for await (const chunk of params.media.body) chunks.push(Buffer.from(chunk));
        parts.set(id, Buffer.concat(chunks).toString());
        return { data: { id } };
      },
      update: async (params, options) => {
        assert.equal(options.headers['If-Match'], '"old"');
        if (failRoot) throw Object.assign(new Error('CAS conflict'), { statusCode: 412 });
        const chunks = [];
        for await (const chunk of params.media.body) chunks.push(Buffer.from(chunk));
        root = JSON.parse(Buffer.concat(chunks).toString());
        for (const part of root._fileCatalog.shards) assert.ok(parts.has(part.id));
        assert.equal(root.files, undefined);
        return { headers: { etag: '"new"' } };
      },
      get: async ({ fileId }) => {
        reads.push(fileId);
        return { data: fileId === 'db' ? JSON.stringify(root) : parts.get(fileId), headers: { etag: '"new"' } };
      },
    },
  };
  const data = {
    schemaVersion: 3,
    revision: 2,
    files: [
      { id: 'f', project: 'p', name: 'New' },
      { id: 'private', project: 'secret', name: 'Hidden' },
    ],
  };
  await provider.saveDatabase(data, { expectedEtag: '"old"' });
  assert.equal(backups, 1);
  assert.deepEqual((await provider.loadDatabase()).files, data.files);
  reads.length = 0;
  const core = await provider.loadDatabaseCore();
  assert.deepEqual(reads, ['db'], 'Core/auth must not download catalog parts');
  assert.equal(core.files[0].name, undefined);
  reads.length = 0;
  const scoped = await provider.loadDatabaseCatalog(() => ({ projects: new Set(['p']), ids: new Set(['f']) }));
  assert.deepEqual(scoped.files, [data.files[0]]);
  assert.equal(reads.length, 2);
  assert.equal(reads.includes(root._fileCatalog.shards.find(part => part.project === 'secret').id), false, 'Private project part must not even be read');
  reads.length = 0;
  const index = await provider.loadDatabaseCatalogIndex(() => ({ projects: new Set(['p']) }));
  assert.deepEqual(index.files, [{ id: 'f', project: 'p', name: 'New' }]);
  assert.equal(index._catalogIndex.length, 2, 'Folder counts retain the compact manifest index');
  assert.deepEqual(reads, ['db'], 'A verified immutable part is reused, but the root/ACL scope must be refreshed');
  const published = structuredClone(root);
  failRoot = true;
  await assert.rejects(provider.saveDatabase({ ...data, revision: 3, files: [] }, { expectedEtag: '"old"' }), { statusCode: 412 });
  assert.deepEqual(root, published);
  assert.equal(backups, 1);
});

test('production JSON stores bind V2 ETags to exact V3 bytes and write conditionally through V2', async () => {
  const cases = [
    ['databaseFileId', p => p.loadDatabase(), (p, value, options) => p.saveDatabase(value, options), { revision: 1, title: 'Проверка' }],
    ['authSessionsFileId', p => p.loadAuthSessions(), (p, value, options) => p.saveAuthSessions(value, options), []],
    ['pushSubscriptionsFileId', p => p.loadPushSubscriptions(), (p, value, options) => p.savePushSubscriptions(value, options), []],
    ['notificationDeliveryFileId', p => p.loadNotificationDeliveryStatus(), (p, value, options) => p.saveNotificationDeliveryStatus(value, options), {}],
    ['knowledge', p => p.loadDocument('knowledge'), (p, value, options) => p.saveDocument('knowledge', value, options), { revision: 1 }],
  ];
  for (const [identity, load, save, value] of cases) {
    const body = JSON.stringify(value);
    const provider = new GoogleDriveStorageProvider();
    provider.initialized = true;
    if (identity === 'knowledge') provider.documentFileIds.knowledge = 'test-file';
    else provider[identity] = 'test-file';
    let writes = 0;
    provider.client = {
      files: { get: async () => ({ data: body, headers: new Headers() }), update: () => assert.fail('V3 must not perform conditional writes') },
    };
    provider.versionClient = {
      files: {
        get: async () => ({ data: { etag: '"v1"', md5Checksum: createHash('md5').update(body).digest('hex') }, headers: new Headers() }),
        update: async (params, options) => {
          writes += 1;
          assert.equal(options.headers['If-Match'], '"v1"');
          assert.equal(params.fields, 'id,etag');
          if (identity === 'databaseFileId' || identity === 'knowledge') {
            assert.ok(params.requestBody.properties.some(p => p.key === 'smenaRevision' && p.value === '1' && p.visibility === 'PRIVATE'));
            assert.equal(params.requestBody.appProperties, undefined);
          }
          return { data: { id: 'test-file', etag: '"v2"' }, headers: new Headers() };
        },
      },
    };
    const loaded = await load(provider);
    assert.equal(storageVersion(loaded), '"v1"', identity);
    await save(provider, loaded, { expectedEtag: storageVersion(loaded) });
    assert.equal(writes, 1);
    await assert.rejects(save(provider, loaded, { expectedEtag: null }), { code: 'STORAGE_VERSION_MISSING' });
    if (identity === 'databaseFileId') assert.equal(storageVersion(loaded), '"v2"');
  }
});

test('a racing Drive download cannot attach a stale ETag to new bytes', async () => {
  const provider = new GoogleDriveStorageProvider();
  provider.initialized = true;
  provider.databaseFileId = 'database';
  let reads = 0;
  provider.versionClient = {
    files: {
      get: async () => {
        reads += 1;
        const body = JSON.stringify({ revision: reads === 1 ? 1 : 2 });
        return { data: { etag: `"v${reads}"`, md5Checksum: createHash('md5').update(body).digest('hex') } };
      },
    },
  };
  provider.client = { files: { get: async () => ({ data: JSON.stringify({ revision: 2 }) }) } };
  const loaded = await provider.loadDatabase();
  assert.equal(reads, 2);
  assert.equal(storageVersion(loaded), '"v2"');
  provider.versionClient.files.get = async () => ({ data: { etag: '"v3"', md5Checksum: 'not-matching' } });
  await assert.rejects(provider.loadDatabase(), { statusCode: 412 });
  provider.versionClient.files.get = async () => ({ data: { etag: '"v3"' } });
  await assert.rejects(provider.loadDatabase(), { code: 'STORAGE_VERSION_MISSING' });
});

for (const format of ['Headers', 'plain-object']) {
  test(`Google Drive preserves conditional-write versions with ${format} response headers`, async () => {
    const headers = etag => (format === 'Headers' ? new Headers({ etag }) : { ETag: etag });
    const cases = [
      ['databaseFileId', p => p.loadDatabase(), (p, value, options) => p.saveDatabase(value, options), { revision: 1 }, p => p.databaseEtag],
      ['authSessionsFileId', p => p.loadAuthSessions(), (p, value, options) => p.saveAuthSessions(value, options), [], p => p.authSessionsEtag],
      [
        'pushSubscriptionsFileId',
        p => p.loadPushSubscriptions(),
        (p, value, options) => p.savePushSubscriptions(value, options),
        [],
        p => p.pushSubscriptionsEtag,
      ],
      [
        'notificationDeliveryFileId',
        p => p.loadNotificationDeliveryStatus(),
        (p, value, options) => p.saveNotificationDeliveryStatus(value, options),
        {},
        p => p.notificationDeliveryEtag,
      ],
      [
        'knowledge',
        p => p.loadDocument('knowledge'),
        (p, value, options) => p.saveDocument('knowledge', value, options),
        { revision: 1 },
        p => p.documentEtags.knowledge,
      ],
    ];
    for (const [identity, load, save, data, version] of cases) {
      const provider = new GoogleDriveStorageProvider();
      provider.initialized = true;
      if (identity === 'knowledge') provider.documentFileIds.knowledge = 'test-file';
      else provider[identity] = 'test-file';
      let writes = 0;
      provider.client = {
        files: {
          get: async () => ({ data: JSON.stringify(data), headers: headers('"version-1"') }),
          update: async (_options, requestOptions) => {
            writes += 1;
            assert.equal(requestOptions.headers['If-Match'], '"version-1"', identity);
            return { headers: headers('"version-2"') };
          },
        },
      };
      const stored = await load(provider);
      assert.equal(storageVersion(stored), '"version-1"', identity);
      await save(provider, stored, { expectedEtag: storageVersion(stored) });
      assert.equal(version(provider), '"version-2"', identity);
      await assert.rejects(save(provider, stored, { expectedEtag: null }), { code: 'STORAGE_VERSION_MISSING' });
      assert.equal(writes, 1);
    }
  });
}

test('serverless cold starts fail closed instead of creating duplicate metadata identities', () => {
  assert.throws(() => assertMetadataBootstrapAllowed({ VERCEL: '1' }), { code: 'DRIVE_BOOTSTRAP_REQUIRED' });
  assert.doesNotThrow(() => assertMetadataBootstrapAllowed({}));
  assert.equal(uniqueDriveMatch({ data: { files: [] } }), null);
  assert.equal(uniqueDriveMatch({ data: { files: [{ id: 'one' }] } }).id, 'one');
  assert.throws(() => uniqueDriveMatch({ data: { files: [{ id: 'one' }, { id: 'two' }] } }), { code: 'DRIVE_STORAGE_AMBIGUOUS' });
});

test('missing serverless metadata never reaches files.create', async () => {
  const previous = process.env.VERCEL;
  process.env.VERCEL = '1';
  const provider = new GoogleDriveStorageProvider();
  provider.initialized = true;
  provider.rootFolderId = 'root';
  provider.databaseFileId = null;
  provider.authSessionsFileId = null;
  provider.pushSubscriptionsFileId = null;
  provider.notificationDeliveryFileId = null;
  provider.documentFileIds = { knowledge: null, bookmarks: null };
  let creates = 0;
  provider.client = {
    files: {
      list: async () => ({ data: { files: [] } }),
      create: async () => {
        creates += 1;
        throw new Error('Unexpected creation');
      },
    },
  };
  try {
    for (const save of [
      () => provider.saveDatabase({ revision: 0 }),
      () => provider.saveAuthSessions([]),
      () => provider.savePushSubscriptions([]),
      () => provider.saveNotificationDeliveryStatus({}),
      () => provider.saveDocument('knowledge', {}),
      () => provider.getOrCreateFolder('missing', 'root'),
    ])
      await assert.rejects(save, { code: 'DRIVE_BOOTSTRAP_REQUIRED' });
    assert.equal(creates, 0);
  } finally {
    if (previous == null) delete process.env.VERCEL;
    else process.env.VERCEL = previous;
  }
});

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

  const session = await provider.createResumableUpload('stored.pdf', 5 * 1024 * 1024, 'application/pdf', 'marker-1', 'https://smena-manager.vercel.app');
  assert.equal(session.uploadUrl, 'https://www.googleapis.com/upload/session-1');
  assert.match(initiated.url, /uploadType=resumable/);
  assert.equal(initiated.options.headers.Authorization, 'Bearer drive-token');
  assert.equal(initiated.options.headers.Origin, 'https://smena-manager.vercel.app');
  await assert.rejects(provider.createResumableUpload('stored.pdf', 10, 'application/pdf', 'marker-1', 'https://example.test/path'), /valid upload origin/u);
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
