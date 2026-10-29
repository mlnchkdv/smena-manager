import test from 'node:test';
import assert from 'node:assert/strict';
import { GoogleDriveStorageProvider } from '../../src/server/storage/google-drive.js';

test('a child Drive provider never reuses pinned deployment metadata and cannot bootstrap outside provisioning', () => {
  const keys = [
    'GOOGLE_DRIVE_FOLDER_ID',
    'GOOGLE_DRIVE_DATABASE_FILE_ID',
    'GOOGLE_DRIVE_UPLOADS_FOLDER_ID',
    'GOOGLE_DRIVE_BACKUPS_FOLDER_ID',
    'GOOGLE_DRIVE_PUSH_FILE_ID',
    'GOOGLE_DRIVE_DELIVERY_FILE_ID',
    'GOOGLE_DRIVE_SESSIONS_FILE_ID',
    'GOOGLE_DRIVE_KNOWLEDGE_FILE_ID',
    'GOOGLE_DRIVE_BOOKMARKS_FILE_ID',
    'VERCEL',
  ];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    for (const key of keys) process.env[key] = 'legacy-pinned-id';
    const root = new GoogleDriveStorageProvider();
    const child = new GoogleDriveStorageProvider({ scope: '11111111-1111-4111-8111-111111111111' });
    assert.equal(root.databaseFileId, 'legacy-pinned-id');
    assert.equal(child.parentFolderId, 'legacy-pinned-id');
    for (const key of [
      'databaseFileId',
      'rootFolderId',
      'uploadsFolderId',
      'backupsFolderId',
      'pushSubscriptionsFileId',
      'notificationDeliveryFileId',
      'authSessionsFileId',
    ])
      assert.equal(child[key], null);
    assert.deepEqual(child.documentFileIds, { knowledge: null, bookmarks: null });
    assert.throws(() => child.assertBootstrapAllowed(), { code: 'DRIVE_BOOTSTRAP_REQUIRED' });
    child.allowBootstrap = true;
    assert.doesNotThrow(() => child.assertBootstrapAllowed());
    root.allowBootstrap = true;
    assert.throws(
      () => root.assertBootstrapAllowed(),
      { code: 'DRIVE_BOOTSTRAP_REQUIRED' },
      'legacy storage is never implicitly initialized by the new creation endpoint',
    );
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
