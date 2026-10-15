import { drive } from '@googleapis/drive';
import { JWT, OAuth2Client } from 'google-auth-library';
import { Readable } from 'node:stream';

const DATABASE_NAME = 'smena-manager-data.json';
const ROOT_FOLDER_NAME = 'Smena-Manager-Storage';

function escapeDriveQuery(value) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export class GoogleDriveStorageProvider {
  name = 'google-drive';
  client = null;
  rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim() || null;
  databaseFileId = process.env.GOOGLE_DRIVE_DATABASE_FILE_ID?.trim() || null;
  credentialType = null;
  initialized = false;
  lastSyncAt = null;

  createAuthClient() {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN?.trim();

    if (clientId && clientSecret && refreshToken) {
      const auth = new OAuth2Client(clientId, clientSecret);
      auth.setCredentials({ refresh_token: refreshToken });
      this.credentialType = 'oauth2';
      return auth;
    }

    let email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
    let privateKey = process.env.GOOGLE_PRIVATE_KEY;
    if (!email && process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
      const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
      email = credentials.client_email;
      privateKey = credentials.private_key;
    }

    if (email && privateKey) {
      if (!this.rootFolderId) {
        throw new Error('GOOGLE_DRIVE_FOLDER_ID is required when using a service account.');
      }
      this.credentialType = 'service-account';
      return new JWT({
        email,
        key: privateKey.replace(/\\n/g, '\n'),
        scopes: ['https://www.googleapis.com/auth/drive'],
      });
    }

    throw new Error('Google Drive credentials are not configured.');
  }

  async init() {
    if (this.initialized) return;
    this.client = drive({ version: 'v3', auth: this.createAuthClient() });
    if (!this.rootFolderId) this.rootFolderId = await this.getOrCreateRootFolder();
    await this.client.files.get({
      fileId: this.rootFolderId,
      fields: 'id,name,trashed',
      supportsAllDrives: true,
    });
    this.initialized = true;
  }

  async getOrCreateRootFolder() {
    const result = await this.client.files.list({
      q: `name = '${ROOT_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id)',
      spaces: 'drive',
      pageSize: 1,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });
    if (result.data.files?.[0]?.id) return result.data.files[0].id;

    const created = await this.client.files.create({
      requestBody: {
        name: ROOT_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
      },
      fields: 'id',
      supportsAllDrives: true,
    });
    return created.data.id;
  }

  async findDatabaseFile() {
    if (this.databaseFileId) return this.databaseFileId;
    const result = await this.client.files.list({
      q: `name = '${DATABASE_NAME}' and '${escapeDriveQuery(this.rootFolderId)}' in parents and trashed = false`,
      fields: 'files(id)',
      spaces: 'drive',
      pageSize: 1,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });
    this.databaseFileId = result.data.files?.[0]?.id || null;
    return this.databaseFileId;
  }

  async loadDatabase() {
    await this.init();
    const fileId = await this.findDatabaseFile();
    if (!fileId) return null;
    const response = await this.client.files.get({ fileId, alt: 'media', supportsAllDrives: true }, { responseType: 'text' });
    this.lastSyncAt = new Date().toISOString();
    return typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
  }

  async saveDatabase(data) {
    await this.init();
    const fileId = await this.findDatabaseFile();
    const media = {
      mimeType: 'application/json',
      body: Readable.from([JSON.stringify(data, null, 2)]),
    };

    if (fileId) {
      await this.client.files.update({ fileId, media, supportsAllDrives: true });
    } else {
      const created = await this.client.files.create({
        requestBody: {
          name: DATABASE_NAME,
          parents: [this.rootFolderId],
          mimeType: 'application/json',
        },
        media,
        fields: 'id',
        supportsAllDrives: true,
      });
      this.databaseFileId = created.data.id;
    }
    this.lastSyncAt = new Date().toISOString();
  }

  async getStatus() {
    await this.init();
    return {
      provider: this.name,
      connected: true,
      persistent: true,
      credentialType: this.credentialType,
      databaseReady: Boolean(await this.findDatabaseFile()),
      lastSyncAt: this.lastSyncAt,
    };
  }
}
