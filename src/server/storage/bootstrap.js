import { createEmptyDatabase } from '../workspace-store.js';
import { assertMetadataBootstrapAllowed } from './google-drive.js';

// Maintenance only: run once from one local process, never from a serverless request.
export async function bootstrapDriveStorage(provider) {
  assertMetadataBootstrapAllowed();
  await provider.init();
  if (!(await provider.loadDatabase())) await provider.saveDatabase(createEmptyDatabase());
  if (!(await provider.findAuthSessionsFile())) await provider.saveAuthSessions([]);
  if (!(await provider.findPushSubscriptionsFile())) await provider.savePushSubscriptions([]);
  if (!(await provider.findNotificationDeliveryFile())) await provider.saveNotificationDeliveryStatus({ version: 1 });
  await provider.ensureUploadsFolder();
  await provider.ensureBackupsFolder();
  return {
    GOOGLE_DRIVE_FOLDER_ID: provider.rootFolderId,
    GOOGLE_DRIVE_DATABASE_FILE_ID: provider.databaseFileId,
    GOOGLE_DRIVE_SESSIONS_FILE_ID: provider.authSessionsFileId,
    GOOGLE_DRIVE_PUSH_FILE_ID: provider.pushSubscriptionsFileId,
    GOOGLE_DRIVE_DELIVERY_FILE_ID: provider.notificationDeliveryFileId,
    GOOGLE_DRIVE_UPLOADS_FOLDER_ID: provider.uploadsFolderId,
    GOOGLE_DRIVE_BACKUPS_FOLDER_ID: provider.backupsFolderId,
  };
}
