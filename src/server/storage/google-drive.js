import { drive } from '@googleapis/drive';
import { JWT, OAuth2Client } from 'google-auth-library';
import fs from 'node:fs';
import { Readable } from 'node:stream';

const DATABASE_NAME = 'smena-manager-data.json';
const ROOT_FOLDER_NAME = 'Smena-Manager-Storage';
const UPLOADS_FOLDER_NAME = 'uploads';
const BACKUPS_FOLDER_NAME = 'backups';

function escapeDriveQuery(value) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export class GoogleDriveStorageProvider {
  name = 'google-drive';
  client = null;
  authClient = null;
  fetch = globalThis.fetch;
  rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim() || null;
  databaseFileId = process.env.GOOGLE_DRIVE_DATABASE_FILE_ID?.trim() || null;
  databaseEtag = null;
  uploadsFolderId = process.env.GOOGLE_DRIVE_UPLOADS_FOLDER_ID?.trim() || null;
  backupsFolderId = null;
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
    this.authClient = this.createAuthClient();
    this.client = drive({ version: 'v3', auth: this.authClient });
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

  async ensureBackupsFolder() {
    await this.init();
    if (!this.backupsFolderId) this.backupsFolderId = await this.getOrCreateFolder(BACKUPS_FOLDER_NAME, this.rootFolderId);
    return this.backupsFolderId;
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

  async createDatabaseBackup(data, label = '') {
    const folderId = await this.ensureBackupsFolder();
    const createdAt = new Date().toISOString();
    const body = JSON.stringify({ createdAt, label: String(label || ''), data }, null, 2);
    const created = await this.client.files.create({
      requestBody: {
        name: `smena-manager-backup-${createdAt.replace(/[:.]/g, '-')}.json`,
        parents: [folderId],
        mimeType: 'application/json',
        appProperties: { smenaBackup: 'true', label: String(label || '').slice(0, 120) },
      },
      media: { mimeType: 'application/json', body: Readable.from([body]) },
      fields: 'id,name,createdTime,size,appProperties',
      supportsAllDrives: true,
    });
    return {
      id: created.data.id,
      createdAt: created.data.createdTime || createdAt,
      label: created.data.appProperties?.label || String(label || ''),
      size: Number(created.data.size) || Buffer.byteLength(body),
    };
  }

  async listDatabaseBackups() {
    const folderId = await this.ensureBackupsFolder();
    const result = await this.client.files.list({
      q: `'${escapeDriveQuery(folderId)}' in parents and trashed = false and appProperties has { key='smenaBackup' and value='true' }`,
      fields: 'files(id,name,createdTime,size,appProperties)',
      spaces: 'drive',
      pageSize: 50,
      orderBy: 'createdTime desc',
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });
    return (result.data.files || []).map(file => ({
      id: file.id,
      createdAt: file.createdTime,
      label: file.appProperties?.label || '',
      size: Number(file.size) || 0,
    }));
  }

  async loadDatabaseBackup(id) {
    const folderId = await this.ensureBackupsFolder();
    const metadata = await this.client.files.get({ fileId: id, fields: 'id,parents,trashed,appProperties', supportsAllDrives: true });
    if (metadata.data.trashed || !metadata.data.parents?.includes(folderId) || metadata.data.appProperties?.smenaBackup !== 'true') {
      throw new Error('Backup is unavailable.');
    }
    const response = await this.client.files.get({ fileId: id, alt: 'media', supportsAllDrives: true }, { responseType: 'text' });
    const stored = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
    if (!stored?.data || typeof stored.data !== 'object') throw new Error('Backup data is invalid.');
    return stored.data;
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

  async createResumableUpload(filename, size, mimeType = 'application/octet-stream', marker) {
    const folderId = await this.ensureUploadsFolder();
    const accessTokenResult = await this.authClient.getAccessToken();
    const accessToken = typeof accessTokenResult === 'string' ? accessTokenResult : accessTokenResult?.token;
    if (!accessToken) throw new Error('Google Drive did not issue an upload access token.');
    const uploadUrl = new URL('https://www.googleapis.com/upload/drive/v3/files');
    uploadUrl.searchParams.set('uploadType', 'resumable');
    uploadUrl.searchParams.set('supportsAllDrives', 'true');
    uploadUrl.searchParams.set('fields', 'id,name,size,mimeType,parents,trashed,appProperties');
    const result = await this.fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': mimeType,
        'X-Upload-Content-Length': String(size),
      },
      body: JSON.stringify({
        name: filename,
        parents: [folderId],
        mimeType,
        appProperties: { smenaUpload: marker },
      }),
    });
    const sessionUrl = result.headers.get('location');
    if (!result.ok || !sessionUrl) throw new Error(`Google Drive could not create an upload session (${result.status}).`);
    return { uploadUrl: sessionUrl, filename };
  }

  async verifyResumableUpload(filename, size, marker, fileId = '') {
    const folderId = await this.ensureUploadsFolder();
    let metadata;
    if (fileId) {
      const result = await this.client.files.get({
        fileId,
        fields: 'id,name,size,mimeType,parents,trashed,appProperties',
        supportsAllDrives: true,
      });
      metadata = result.data;
    } else {
      const result = await this.client.files.list({
        q: `name = '${escapeDriveQuery(filename)}' and '${escapeDriveQuery(folderId)}' in parents and trashed = false and appProperties has { key='smenaUpload' and value='${escapeDriveQuery(marker)}' }`,
        fields: 'files(id,name,size,mimeType,parents,trashed,appProperties)',
        spaces: 'drive',
        pageSize: 1,
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
      });
      metadata = result.data.files?.[0];
    }
    if (
      !metadata?.id ||
      metadata.trashed ||
      metadata.name !== filename ||
      Number(metadata.size) !== size ||
      !metadata.parents?.includes(folderId) ||
      metadata.appProperties?.smenaUpload !== marker
    ) {
      return null;
    }
    return {
      fileId: metadata.id,
      filename: metadata.name,
      size: Number(metadata.size),
      mimeType: metadata.mimeType || 'application/octet-stream',
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
