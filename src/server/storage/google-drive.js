import { drive } from '@googleapis/drive';
import { JWT, OAuth2Client } from 'google-auth-library';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { rememberStorageVersion } from './version-token.js';
import { configureProviderTimeout, recordProviderFailure } from '../provider-safety.js';
import { writeCatalogShards, materializeCatalog } from './file-catalog-shards.js';

function responseHeader(response, name) {
  const headers = response.headers;
  if (typeof headers?.get === 'function') return headers.get(name);
  return Object.entries(headers || {}).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1] || null;
}

function conditionalWriteOptions(options, fallback) {
  const etag = Object.hasOwn(options, 'expectedEtag') ? options.expectedEtag : fallback;
  if (!etag) throw Object.assign(new Error('Storage version is missing. Reload before saving.'), { statusCode: 503, code: 'STORAGE_VERSION_MISSING' });
  return { headers: { 'If-Match': etag } };
}

const DATABASE_NAME = 'smena-manager-data.json';
const ROOT_FOLDER_NAME = 'Smena-Manager-Storage';
const UPLOADS_FOLDER_NAME = 'uploads';
const BACKUPS_FOLDER_NAME = 'backups';
const PUSH_SUBSCRIPTIONS_NAME = 'smena-manager-push-subscriptions.json';
const NOTIFICATION_DELIVERY_NAME = 'smena-manager-notification-delivery.json';
const AUTH_SESSIONS_NAME = 'smena-manager-auth-sessions.json';
const DOCUMENT_FILES = Object.freeze({
  knowledge: 'smena-manager-knowledge.json',
  bookmarks: 'smena-manager-bookmarks.json',
});

function escapeDriveQuery(value) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export function uniqueDriveMatch(result) {
  const files = result.data.files || [];
  if (files.length > 1)
    throw Object.assign(new Error('Multiple storage identities match. Pin the intended file or folder ID before continuing.'), {
      statusCode: 503,
      code: 'DRIVE_STORAGE_AMBIGUOUS',
    });
  return files[0] || null;
}

export function assertMetadataBootstrapAllowed(env = process.env) {
  if (env.VERCEL)
    throw Object.assign(new Error('Initialize missing Drive storage metadata with npm run setup:storage from a single local process before deploying.'), {
      statusCode: 503,
      code: 'DRIVE_BOOTSTRAP_REQUIRED',
    });
}

export class GoogleDriveStorageProvider {
  name = 'google-drive';
  client = null;
  versionClient = null;
  authClient = null;
  fetch = globalThis.fetch;
  rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim() || null;
  databaseFileId = process.env.GOOGLE_DRIVE_DATABASE_FILE_ID?.trim() || null;
  databaseEtag = null;
  catalogRoot = null;
  documentFileIds = {
    knowledge: process.env.GOOGLE_DRIVE_KNOWLEDGE_FILE_ID?.trim() || null,
    bookmarks: process.env.GOOGLE_DRIVE_BOOKMARKS_FILE_ID?.trim() || null,
  };
  documentEtags = { knowledge: null, bookmarks: null };
  pushSubscriptionsFileId = process.env.GOOGLE_DRIVE_PUSH_FILE_ID?.trim() || null;
  pushSubscriptionsEtag = null;
  notificationDeliveryFileId = process.env.GOOGLE_DRIVE_DELIVERY_FILE_ID?.trim() || null;
  notificationDeliveryEtag = null;
  authSessionsFileId = process.env.GOOGLE_DRIVE_SESSIONS_FILE_ID?.trim() || null;
  authSessionsEtag = null;
  uploadsFolderId = process.env.GOOGLE_DRIVE_UPLOADS_FOLDER_ID?.trim() || null;
  backupsFolderId = process.env.GOOGLE_DRIVE_BACKUPS_FOLDER_ID?.trim() || null;
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
    this.authClient = configureProviderTimeout(this.createAuthClient());
    this.client = drive({ version: 'v3', auth: this.authClient, timeout: 30000, retry: false });
    this.versionClient = drive({ version: 'v2', auth: this.authClient, timeout: 30000, retry: false });
    if (!this.rootFolderId) this.rootFolderId = await this.getOrCreateRootFolder();
    await this.client.files.get({
      fileId: this.rootFolderId,
      fields: 'id,name,trashed',
      supportsAllDrives: true,
    });
    this.initialized = true;
  }

  // V3 media/metadata responses may omit ETag. V2 exposes the resource validator.
  // Bind it to the downloaded bytes using Google's checksum, never to a later read.
  async readVersionedJson(fileId) {
    if (!this.versionClient) return this.client.files.get({ fileId, alt: 'media', supportsAllDrives: true }, { responseType: 'text' });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const metadata = await this.versionClient.files.get({ fileId, fields: 'etag,md5Checksum', supportsAllDrives: true });
      const etag = metadata.data.etag || responseHeader(metadata, 'etag');
      if (!etag || !metadata.data.md5Checksum)
        throw Object.assign(new Error('Storage version is missing. Reload before saving.'), { statusCode: 503, code: 'STORAGE_VERSION_MISSING' });
      const media = await this.client.files.get({ fileId, alt: 'media', supportsAllDrives: true }, { responseType: 'text' });
      if (typeof media.data === 'string' && createHash('md5').update(media.data).digest('hex') === metadata.data.md5Checksum)
        return { data: media.data, headers: { etag } };
    }
    throw Object.assign(new Error('Storage changed while it was being read. Try again.'), { statusCode: 412, code: 412 });
  }

  async updateVersionedJson(params, options) {
    if (!this.versionClient) return this.client.files.update(params, options);
    const { requestBody, fields: _fields, ...rest } = params;
    void _fields;
    const properties = requestBody?.appProperties;
    const updated = await this.versionClient.files.update(
      {
        ...rest,
        fields: 'id,etag',
        ...(properties ? { requestBody: { properties: Object.entries(properties).map(([key, value]) => ({ key, value, visibility: 'PRIVATE' })) } } : {}),
      },
      options,
    );
    return { data: updated.data, headers: { etag: updated.data?.etag || responseHeader(updated, 'etag') } };
  }

  async getOrCreateFolder(name, parentId = null) {
    const parentQuery = parentId ? ` and '${escapeDriveQuery(parentId)}' in parents` : '';
    const result = await this.client.files.list({
      q: `name = '${escapeDriveQuery(name)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false${parentQuery}`,
      fields: 'files(id)',
      spaces: 'drive',
      pageSize: 2,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });
    const existing = uniqueDriveMatch(result);
    if (existing) return existing.id;
    assertMetadataBootstrapAllowed();

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
      pageSize: 2,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });
    this.databaseFileId = uniqueDriveMatch(result)?.id || null;
    return this.databaseFileId;
  }

  async loadDatabase() {
    await this.init();
    const fileId = await this.findDatabaseFile();
    if (!fileId) return null;
    const response = await this.readVersionedJson(fileId);
    const etag = responseHeader(response, 'etag');
    this.databaseEtag = etag;
    this.lastSyncAt = new Date().toISOString();
    const root = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
    this.catalogRoot = root;
    const data = await materializeCatalog(root, async id => {
      const part = await this.client.files.get({ fileId: id, alt: 'media', supportsAllDrives: true }, { responseType: 'text' });
      return part.data;
    });
    return rememberStorageVersion(data, etag);
  }

  async getDatabaseVersion() {
    await this.init();
    const fileId = await this.findDatabaseFile();
    if (!fileId) return null;
    const response = await this.client.files.get({
      fileId,
      fields: 'id,modifiedTime,version,appProperties',
      supportsAllDrives: true,
    });
    const revision = Number(response.data.appProperties?.smenaRevision);
    return {
      revision: Number.isSafeInteger(revision) && revision >= 0 ? revision : null,
      updatedAt: response.data.modifiedTime || null,
      version: response.data.version || null,
    };
  }

  async setDatabaseRevisionMetadata(revision) {
    await this.init();
    const fileId = await this.findDatabaseFile();
    if (!fileId) return;
    const requestOptions = conditionalWriteOptions({}, this.databaseEtag);
    const updated = await this.updateVersionedJson(
      {
        fileId,
        requestBody: { appProperties: { smenaRevision: String(revision) } },
        fields: 'id,modifiedTime,version,appProperties',
        supportsAllDrives: true,
      },
      requestOptions,
    );
    this.databaseEtag = responseHeader(updated, 'etag');
  }

  async saveDatabase(data, options = {}) {
    await this.init();
    const fileId = await this.findDatabaseFile();
    // Validate CAS before any staging uploads. Old deployed readers reject the
    // schema-3 root rather than flattening or overwriting a partial catalog.
    if (fileId) conditionalWriteOptions(options, this.databaseEtag);
    let stored = data;
    if (data.schemaVersion >= 3 && Array.isArray(data.files)) {
      if (fileId && !this.catalogRoot?._fileCatalog) {
        await this.createDatabaseBackup(this.catalogRoot || data, 'Before file catalog sharding');
      }
      stored = await writeCatalogShards(data, this.catalogRoot?._fileCatalog, async (text, hash) => {
        const created = await this.client.files.create({
          requestBody: { name: `smena-catalog-${hash}.json`, parents: [this.rootFolderId], mimeType: 'application/json' },
          media: { mimeType: 'application/json', body: Readable.from([text]) },
          fields: 'id',
          supportsAllDrives: true,
        });
        return created.data.id;
      });
    }
    const media = {
      mimeType: 'application/json',
      body: Readable.from([JSON.stringify(stored, null, 2)]),
    };

    if (fileId) {
      const requestOptions = conditionalWriteOptions(options, this.databaseEtag);
      const updated = await this.updateVersionedJson(
        {
          fileId,
          requestBody: { appProperties: { smenaRevision: String(data.revision) } },
          media,
          supportsAllDrives: true,
        },
        requestOptions,
      );
      this.databaseEtag = responseHeader(updated, 'etag');
    } else {
      assertMetadataBootstrapAllowed();
      const created = await this.client.files.create({
        requestBody: {
          name: DATABASE_NAME,
          parents: [this.rootFolderId],
          mimeType: 'application/json',
          appProperties: { smenaRevision: String(data.revision) },
        },
        media,
        fields: 'id',
        supportsAllDrives: true,
      });
      this.databaseFileId = created.data.id;
      this.databaseEtag = responseHeader(created, 'etag');
    }
    this.lastSyncAt = new Date().toISOString();
    this.catalogRoot = stored;
    rememberStorageVersion(data, this.databaseEtag);
  }

  async findDocumentFile(name) {
    const filename = DOCUMENT_FILES[name];
    if (!filename) throw new Error('Invalid workspace document name.');
    if (this.documentFileIds[name]) return this.documentFileIds[name];
    const result = await this.client.files.list({
      q: `name = '${filename}' and '${escapeDriveQuery(this.rootFolderId)}' in parents and trashed = false`,
      fields: 'files(id)',
      spaces: 'drive',
      pageSize: 2,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });
    this.documentFileIds[name] = uniqueDriveMatch(result)?.id || null;
    return this.documentFileIds[name];
  }

  async loadDocument(name) {
    await this.init();
    const fileId = await this.findDocumentFile(name);
    if (!fileId) return null;
    const response = await this.readVersionedJson(fileId);
    this.documentEtags[name] = responseHeader(response, 'etag');
    this.lastSyncAt = new Date().toISOString();
    return rememberStorageVersion(typeof response.data === 'string' ? JSON.parse(response.data) : response.data, this.documentEtags[name]);
  }

  async saveDocument(name, data, options = {}) {
    await this.init();
    const filename = DOCUMENT_FILES[name];
    if (!filename) throw new Error('Invalid workspace document name.');
    const fileId = await this.findDocumentFile(name);
    const media = { mimeType: 'application/json', body: Readable.from([JSON.stringify(data, null, 2)]) };
    if (fileId) {
      const requestOptions = conditionalWriteOptions(options, this.documentEtags[name]);
      const updated = await this.updateVersionedJson(
        {
          fileId,
          requestBody: { appProperties: { smenaDocument: name, smenaRevision: String(data.revision) } },
          media,
          supportsAllDrives: true,
        },
        requestOptions,
      );
      this.documentEtags[name] = responseHeader(updated, 'etag');
    } else {
      assertMetadataBootstrapAllowed();
      const created = await this.client.files.create({
        requestBody: {
          name: filename,
          parents: [this.rootFolderId],
          mimeType: 'application/json',
          appProperties: { smenaDocument: name, smenaRevision: String(data.revision) },
        },
        media,
        fields: 'id',
        supportsAllDrives: true,
      });
      this.documentFileIds[name] = created.data.id;
      this.documentEtags[name] = responseHeader(created, 'etag');
    }
    this.lastSyncAt = new Date().toISOString();
    rememberStorageVersion(data, this.documentEtags[name]);
  }

  async findPushSubscriptionsFile() {
    if (this.pushSubscriptionsFileId) return this.pushSubscriptionsFileId;
    const result = await this.client.files.list({
      q: `name = '${PUSH_SUBSCRIPTIONS_NAME}' and '${escapeDriveQuery(this.rootFolderId)}' in parents and trashed = false`,
      fields: 'files(id)',
      spaces: 'drive',
      pageSize: 2,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });
    this.pushSubscriptionsFileId = uniqueDriveMatch(result)?.id || null;
    return this.pushSubscriptionsFileId;
  }

  async loadPushSubscriptions() {
    await this.init();
    const fileId = await this.findPushSubscriptionsFile();
    if (!fileId) return [];
    const response = await this.readVersionedJson(fileId);
    this.pushSubscriptionsEtag = responseHeader(response, 'etag');
    const parsed = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
    return rememberStorageVersion(Array.isArray(parsed) ? parsed : [], this.pushSubscriptionsEtag);
  }

  async savePushSubscriptions(subscriptions, options = {}) {
    await this.init();
    const fileId = await this.findPushSubscriptionsFile();
    const media = {
      mimeType: 'application/json',
      body: Readable.from([JSON.stringify(subscriptions, null, 2)]),
    };
    if (fileId) {
      const requestOptions = conditionalWriteOptions(options, this.pushSubscriptionsEtag);
      const updated = await this.updateVersionedJson({ fileId, media, supportsAllDrives: true }, requestOptions);
      this.pushSubscriptionsEtag = responseHeader(updated, 'etag');
      return;
    }
    assertMetadataBootstrapAllowed();
    const created = await this.client.files.create({
      requestBody: {
        name: PUSH_SUBSCRIPTIONS_NAME,
        parents: [this.rootFolderId],
        mimeType: 'application/json',
        appProperties: { smenaPrivate: 'push-subscriptions' },
      },
      media,
      fields: 'id',
      supportsAllDrives: true,
    });
    this.pushSubscriptionsFileId = created.data.id;
    this.pushSubscriptionsEtag = responseHeader(created, 'etag');
  }

  async findNotificationDeliveryFile() {
    if (this.notificationDeliveryFileId) return this.notificationDeliveryFileId;
    const result = await this.client.files.list({
      q: `name = '${NOTIFICATION_DELIVERY_NAME}' and '${escapeDriveQuery(this.rootFolderId)}' in parents and trashed = false`,
      fields: 'files(id)',
      spaces: 'drive',
      pageSize: 2,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });
    this.notificationDeliveryFileId = uniqueDriveMatch(result)?.id || null;
    return this.notificationDeliveryFileId;
  }

  async loadNotificationDeliveryStatus() {
    await this.init();
    const fileId = await this.findNotificationDeliveryFile();
    if (!fileId) return null;
    const response = await this.readVersionedJson(fileId);
    this.notificationDeliveryEtag = responseHeader(response, 'etag');
    return rememberStorageVersion(typeof response.data === 'string' ? JSON.parse(response.data) : response.data, this.notificationDeliveryEtag);
  }

  async saveNotificationDeliveryStatus(status, options = {}) {
    await this.init();
    const fileId = await this.findNotificationDeliveryFile();
    const media = { mimeType: 'application/json', body: Readable.from([JSON.stringify(status, null, 2)]) };
    if (fileId) {
      const requestOptions = conditionalWriteOptions(options, this.notificationDeliveryEtag);
      const updated = await this.updateVersionedJson({ fileId, media, supportsAllDrives: true }, requestOptions);
      this.notificationDeliveryEtag = responseHeader(updated, 'etag');
      return;
    }
    assertMetadataBootstrapAllowed();
    const created = await this.client.files.create({
      requestBody: {
        name: NOTIFICATION_DELIVERY_NAME,
        parents: [this.rootFolderId],
        mimeType: 'application/json',
        appProperties: { smenaPrivate: 'notification-delivery' },
      },
      media,
      fields: 'id',
      supportsAllDrives: true,
    });
    this.notificationDeliveryFileId = created.data.id;
    this.notificationDeliveryEtag = responseHeader(created, 'etag');
  }

  async findAuthSessionsFile() {
    if (this.authSessionsFileId) return this.authSessionsFileId;
    const result = await this.client.files.list({
      q: `name = '${AUTH_SESSIONS_NAME}' and '${escapeDriveQuery(this.rootFolderId)}' in parents and trashed = false`,
      fields: 'files(id)',
      spaces: 'drive',
      pageSize: 2,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });
    this.authSessionsFileId = uniqueDriveMatch(result)?.id || null;
    return this.authSessionsFileId;
  }

  async loadAuthSessions() {
    await this.init();
    const fileId = await this.findAuthSessionsFile();
    if (!fileId) return [];
    const response = await this.readVersionedJson(fileId);
    this.authSessionsEtag = responseHeader(response, 'etag');
    const parsed = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
    return rememberStorageVersion(Array.isArray(parsed) ? parsed : [], this.authSessionsEtag);
  }

  async saveAuthSessions(sessions, options = {}) {
    await this.init();
    const fileId = await this.findAuthSessionsFile();
    const media = { mimeType: 'application/json', body: Readable.from([JSON.stringify(sessions, null, 2)]) };
    if (fileId) {
      const requestOptions = conditionalWriteOptions(options, this.authSessionsEtag);
      const updated = await this.updateVersionedJson({ fileId, media, supportsAllDrives: true }, requestOptions);
      this.authSessionsEtag = responseHeader(updated, 'etag');
      return;
    }
    assertMetadataBootstrapAllowed();
    const created = await this.client.files.create({
      requestBody: {
        name: AUTH_SESSIONS_NAME,
        parents: [this.rootFolderId],
        mimeType: 'application/json',
        appProperties: { smenaPrivate: 'auth-sessions' },
      },
      media,
      fields: 'id',
      supportsAllDrives: true,
    });
    this.authSessionsFileId = created.data.id;
    this.authSessionsEtag = responseHeader(created, 'etag');
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
    const files = [];
    let pageToken;
    do {
      const result = await this.client.files.list({
        q: `'${escapeDriveQuery(folderId)}' in parents and trashed = false and appProperties has { key='smenaBackup' and value='true' }`,
        fields: 'nextPageToken,files(id,name,createdTime,size,appProperties)',
        pageToken,
        spaces: 'drive',
        pageSize: 200,
        orderBy: 'createdTime desc',
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
      });
      files.push(...(result.data.files || []));
      pageToken = result.data.nextPageToken;
    } while (pageToken);
    return files.map(file => ({
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

  async deleteDatabaseBackup(id) {
    const folderId = await this.ensureBackupsFolder();
    const metadata = await this.client.files.get({ fileId: id, fields: 'id,parents,trashed,appProperties', supportsAllDrives: true });
    if (metadata.data.trashed || !metadata.data.parents?.includes(folderId) || metadata.data.appProperties?.smenaBackup !== 'true') {
      throw new Error('Backup is unavailable.');
    }
    await this.client.files.delete({ fileId: id, supportsAllDrives: true });
  }

  async uploadFile(filename, source, mimeType = 'application/octet-stream', options = {}) {
    await this.init();
    const folderId = await this.ensureUploadsFolder();
    const isBuffer = Buffer.isBuffer(source);
    const body = isBuffer ? Readable.from(source) : source?.path ? fs.createReadStream(source.path) : null;
    if (!body) throw new TypeError('Upload source must be a Buffer or a file path.');
    const uploaded = await this.client.files.create(
      {
        requestBody: { name: filename, parents: [folderId] },
        media: { mimeType, body },
        fields: 'id,name,size,mimeType,webViewLink',
        supportsAllDrives: true,
      },
      options.signal ? { signal: options.signal } : undefined,
    );
    return {
      fileId: uploaded.data.id,
      filename: uploaded.data.name || filename,
      size: Number(uploaded.data.size) || (isBuffer ? source.length : Number(source.size) || 0),
      mimeType: uploaded.data.mimeType || mimeType,
      webViewLink: uploaded.data.webViewLink || undefined,
    };
  }

  async createResumableUpload(filename, size, mimeType = 'application/octet-stream', marker, origin = '') {
    if (origin) {
      const parsed = new URL(origin);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) throw new TypeError('A valid upload origin is required.');
    }
    const folderId = await this.ensureUploadsFolder();
    const accessTokenResult = await this.authClient.getAccessToken();
    const accessToken = typeof accessTokenResult === 'string' ? accessTokenResult : accessTokenResult?.token;
    if (!accessToken) throw new Error('Google Drive did not issue an upload access token.');
    const uploadUrl = new URL('https://www.googleapis.com/upload/drive/v3/files');
    uploadUrl.searchParams.set('uploadType', 'resumable');
    uploadUrl.searchParams.set('supportsAllDrives', 'true');
    uploadUrl.searchParams.set('fields', 'id,name,size,mimeType,parents,trashed,appProperties');
    const result = await this.fetch(uploadUrl, {
      signal: AbortSignal.timeout(15000),
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': mimeType,
        'X-Upload-Content-Length': String(size),
        // Google binds resumable session CORS to the initiating request's origin.
        ...(origin ? { Origin: origin } : {}),
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

  async getUploadMetadata(filename, fileId, options = {}) {
    await this.init();
    if (!fileId) return this.findUpload(filename);
    try {
      const folderId = await this.ensureUploadsFolder();
      const result = await this.client.files.get(
        { fileId, fields: 'id,name,size,mimeType,trashed,parents,md5Checksum,version', supportsAllDrives: true },
        options.signal ? { signal: options.signal } : undefined,
      );
      return result.data.trashed || result.data.name !== filename || !result.data.parents?.includes(folderId) ? null : result.data;
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
    const responseSize = Number(responseHeader(response, 'content-length')) || 0;
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
    let storageQuota = null;
    try {
      const response = await this.client.about.get({ fields: 'storageQuota' });
      storageQuota = response.data?.storageQuota || null;
    } catch (error) {
      // Shared drives and restricted service accounts may not expose account quota.
      recordProviderFailure(error);
    }
    const numericQuota = value => {
      const number = Number(value);
      return Number.isFinite(number) && number >= 0 ? number : null;
    };
    return {
      provider: this.name,
      connected: true,
      persistent: true,
      credentialType: this.credentialType,
      databaseReady: Boolean(await this.findDatabaseFile()),
      uploadsFolderId: this.uploadsFolderId,
      uploadsReady: Boolean(this.uploadsFolderId),
      lastSyncAt: this.lastSyncAt,
      usageBytes: numericQuota(storageQuota?.usage),
      quotaBytes: numericQuota(storageQuota?.limit),
      driveUsageBytes: numericQuota(storageQuota?.usageInDrive),
      trashUsageBytes: numericQuota(storageQuota?.usageInDriveTrash),
    };
  }
}
