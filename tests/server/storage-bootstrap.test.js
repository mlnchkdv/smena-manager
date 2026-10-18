import assert from 'node:assert/strict';
import test from 'node:test';
import { bootstrapDriveStorage } from '../../src/server/storage/bootstrap.js';

test('maintenance setup preserves every existing metadata file and returns pinned identities', async () => {
  const neverSave = async () => {
    throw new Error('Existing metadata must not be replaced');
  };
  const provider = {
    rootFolderId: 'root',
    databaseFileId: 'db',
    authSessionsFileId: 'sessions',
    pushSubscriptionsFileId: 'push',
    notificationDeliveryFileId: 'delivery',
    uploadsFolderId: 'uploads',
    backupsFolderId: 'backups',
    init: async () => {},
    loadDatabase: async () => ({ tasks: [] }),
    findAuthSessionsFile: async () => 'sessions',
    findPushSubscriptionsFile: async () => 'push',
    findNotificationDeliveryFile: async () => 'delivery',
    ensureUploadsFolder: async () => 'uploads',
    ensureBackupsFolder: async () => 'backups',
    saveDatabase: neverSave,
    saveAuthSessions: neverSave,
    savePushSubscriptions: neverSave,
    saveNotificationDeliveryStatus: neverSave,
  };
  const result = await bootstrapDriveStorage(provider);
  assert.equal(result.GOOGLE_DRIVE_DATABASE_FILE_ID, 'db');
  assert.equal(result.GOOGLE_DRIVE_SESSIONS_FILE_ID, 'sessions');
  assert.equal(Object.keys(result).length, 7);
});
