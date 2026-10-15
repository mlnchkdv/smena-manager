import { GoogleDriveStorageProvider } from './google-drive.js';
import { LocalStorageProvider } from './local-storage.js';

let provider;

export function hasGoogleDriveCredentials() {
  const hasOAuth = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN);
  const hasServiceAccount = Boolean((process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) || process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  return hasOAuth || hasServiceAccount;
}

export function getStorageProvider() {
  if (provider) return provider;
  if (hasGoogleDriveCredentials()) {
    provider = new GoogleDriveStorageProvider();
    return provider;
  }
  if (process.env.VERCEL) {
    throw new Error('Google Drive credentials are required on Vercel.');
  }
  provider = new LocalStorageProvider();
  return provider;
}

export function resetStorageProvider() {
  provider = undefined;
}
