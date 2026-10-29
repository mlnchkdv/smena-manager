import { GoogleDriveStorageProvider } from './google-drive.js';
import { LocalStorageProvider } from './local-storage.js';
import path from 'node:path';
import { workspaceScope } from '../workspace-context.js';

const providers = new Map();

export function hasGoogleDriveCredentials() {
  const hasOAuth = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN);
  const hasServiceAccount = Boolean((process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) || process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  return hasOAuth || hasServiceAccount;
}

export function getStorageProvider(scope = workspaceScope()) {
  if (providers.has(scope)) return providers.get(scope);
  let provider;
  if (hasGoogleDriveCredentials()) {
    provider = new GoogleDriveStorageProvider(scope === 'default' ? {} : { scope });
  } else if (process.env.VERCEL) {
    throw new Error('Google Drive credentials are required on Vercel.');
  } else {
    const root = process.env.DATABASE_PATH || path.join(process.cwd(), '.data', 'smena-manager-data.json');
    const directory = path.join(path.dirname(root), 'workspaces', scope);
    provider =
      scope === 'default'
        ? new LocalStorageProvider()
        : new LocalStorageProvider(path.join(directory, 'workspace.json'), {
            uploadsPath: path.join(directory, 'uploads'),
            backupsPath: path.join(directory, 'backups'),
          });
  }
  providers.set(scope, provider);
  return provider;
}

export function resetStorageProvider() {
  providers.clear();
}
