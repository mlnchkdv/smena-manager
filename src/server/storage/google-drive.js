import { drive } from '@googleapis/drive';
import { JWT, OAuth2Client } from 'google-auth-library';
import fs from 'node:fs';
import { Readable } from 'node:stream';

const DATABASE_NAME = 'smena-manager-data.json';
const ROOT_FOLDER_NAME = 'Smena-Manager-Storage';
const UPLOADS_FOLDER_NAME = 'uploads';

function escapeDriveQuery(value) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export class GoogleDriveStorageProvider {
  name = 'google-drive';
  client = null;
  rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim() || null;
  databaseFileId = process.env.GOOGLE_DRIVE_DATABASE_FILE_ID?.trim() || null;
  databaseEtag = null;
  uploadsFolderId = process.env.GOOGLE_DRIVE_UPLOADS_FOLDER_ID?.trim() || null;
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

  async getOrCreateFolder(name, parentId = null) {
    const parentQuery = parentId ? ` and '${escapeDriveQuery(parentId)}' in parents` : '';
    const result = await this.client.files.list({
      q: `name = '${escapeDriveQuery(name)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false${parentQuery}`,
      fields: 'files(id)',
      spaces: 'drive',
      pageSize: 1,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });
    if (result.data.files?.[0]?.id) return result.data.files[0].id;

    const created = await this.client.files.create({
      requestBody: {
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: parentId ? [parentId] : undefined,
      },
      fields: 'id',
      supportsAllDrives: true,
    });
    return created.data.id;
  }

  async getOrCreateRootFolder() {
    return this.getOrCreateFolder(ROOT_FOLDER_NAME);
  }

  async ensureUploadsFolder() {
    await this.init();
    if (!this.uploadsFolderId) this.uploadsFolderId = await this.getOrCreateFolder(UPLOADS_FOLDER_NAME, this.rootFolderId);
    return this.uploadsFolderId;
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
    this.databaseEtag = response.headers?.etag || null;
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
      const requestOptions = this.databaseEtag ? { headers: { 'If-Match': this.databaseEtag } } : undefined;
      const updated = await this.client.files.update({ fileId, media, supportsAllDrives: true }, requestOptions);
      this.databaseEtag = updated.headers?.etag || null;
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
      this.databaseEtag = created.headers?.etag || null;
    }
    this.lastSyncAt = new Date().toISOString();
  }

  async uploadFile(filename, source, mimeType = 'application/octet-stream') {
    await this.init();
    const folderId = await this.ensureUploadsFolder();
    const isBuffer = Buffer.isBuffer(source);
    const body = isBuffer ? Readable.from(source) : source?.path ? fs.createReadStream(source.path) : null;
    if (!body) throw new TypeError('Upload source must be a Buffer or a file path.');
    const uploaded = await this.client.files.create({
      requestBody: { name: filename, parents: [folderId] },
      media: { mimeType, body },
      fields: 'id,name,size,mimeType,webViewLink',
      supportsAllDrives: true,
    });
    return {
      fileId: uploaded.data.id,
      filename: uploaded.data.name || filename,
      size: Number(uploaded.data.size) || (isBuffer ? source.length : Number(source.size) || 0),
      mimeType: uploaded.data.mimeType || mimeType,
      webViewLink: uploaded.data.webViewLink || undefined,
    };
  }

  async findUpload(filename) {
    const folderId = await this.ensureUploadsFolder();
    const result = await this.client.files.list({
      q: `name = '${escapeDriveQuery(filename)}' and '${escapeDriveQuery(folderId)}' in parents and trashed = false`,
      fields: 'files(id,name,size,mimeType,trashed)',
      spaces: 'drive',
      pageSize: 1,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });
    return result.data.files?.[0] || null;
  }

  async getUploadMetadata(filename, fileId) {
    await this.init();
    if (!fileId) return this.findUpload(filename);
    try {
      const result = await this.client.files.get({ fileId, fields: 'id,name,size,mimeType,trashed', supportsAllDrives: true });
      return result.data.trashed ? null : result.data;
    } catch (error) {
      if (error?.code === 404 || error?.response?.status === 404) return null;
      throw error;
    }
  }

  async fileExists(filename, fileId) {
    return Boolean(await this.getUploadMetadata(filename, fileId));
  }

  async openDownloadStream(filename, fileId, range) {
    const metadata = await this.getUploadMetadata(filename, fileId);
    if (!metadata?.id) return null;
    const size = Number(metadata.size) || 0;
    const start = Math.max(0, Number(range?.start || 0));
    const end = size ? Math.min(size - 1, Number(range?.end ?? size - 1)) : Number(range?.end ?? Number.MAX_SAFE_INTEGER);
    if (size && (start > end || start >= size)) return null;
    const response = await this.client.files.get(
      { fileId: metadata.id, alt: 'media', supportsAllDrives: true },
      { responseType: 'stream', headers: range ? { Range: `bytes=${start}-${end}` } : undefined },
    );
    const responseSize = Number(response.headers['content-length']) || 0;
    return {
      stream: response.data,
      mimeType: metadata.mimeType || 'application/octet-stream',
      size: size || responseSize,
      start,
      end: size ? end : start + Math.max(0, responseSize - 1),
    };
  }

  async downloadFile(filename, fileId) {
    const result = await this.openDownloadStream(filename, fileId);
    if (!result) return null;
    const chunks = [];
    for await (const chunk of result.stream) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);
    return { buffer, mimeType: result.mimeType, size: buffer.length };
  }

  async deleteFile(filename, fileId) {
    const metadata = await this.getUploadMetadata(filename, fileId);
    if (!metadata?.id) return false;
    await this.client.files.delete({ fileId: metadata.id, supportsAllDrives: true });
    return true;
  }

  async getStatus() {
    await this.init();
    return {
      provider: this.name,
      connected: true,
      persistent: true,
      credentialType: this.credentialType,
      databaseReady: Boolean(await this.findDatabaseFile()),
      uploadsFolderId: this.uploadsFolderId,
      uploadsReady: Boolean(this.uploadsFolderId),
      lastSyncAt: this.lastSyncAt,
    };
  }
}
