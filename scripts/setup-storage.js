import 'dotenv/config';
import fs from 'node:fs/promises';
import { GoogleDriveStorageProvider } from '../src/server/storage/google-drive.js';
import { bootstrapDriveStorage } from '../src/server/storage/bootstrap.js';
import { reportProviderError } from '../src/server/provider-safety.js';

await fs.mkdir('.data', { recursive: true });
const lockPath = '.data/storage-setup.lock';
const lock = await fs.open(lockPath, 'wx').catch(() => {
  throw new Error('Another storage setup may be active. Verify it has stopped before removing .data/storage-setup.lock.');
});
try {
  const identities = await bootstrapDriveStorage(new GoogleDriveStorageProvider());
  console.log('Storage initialized. Existing workspace content was not replaced. Pin these IDs in the deployment environment:');
  for (const [key, value] of Object.entries(identities)) console.log(`${key}=${value}`);
} catch (error) {
  reportProviderError('[Storage setup]', error);
  process.exitCode = 1;
} finally {
  await lock.close();
  await fs.unlink(lockPath);
}
