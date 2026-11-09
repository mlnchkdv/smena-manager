import { drive } from '@googleapis/drive';
import { JWT, OAuth2Client } from 'google-auth-library';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { drivePreparedBackups, restorePreparedBackup } from './prepared-backup-objects.js';
import { driveKnowledgeImportJournals } from './knowledge-import-journal.js';
import { driveKnowledgeInventory } from './knowledge-object-inventory.js';
import { createHash } from 'node:crypto';
import { rememberStorageVersion, storageVersion } from './version-token.js';
import { configureProviderTimeout, recordProviderFailure } from '../provider-safety.js';
import { writeCatalogShards, materializeCatalog, catalogCore, readCatalogShards } from './file-catalog-shards.js';
import { fileCatalogIndex } from '../file-catalog-index.js';
import { readCatalogAccounting } from '../file-catalog-accounting.js';
import { metadataWriteBase, patchCatalogMetadata } from './catalog-metadata-write.js';
import { backupJson } from './backup-json.js';
import { writeFileMetadataParts } from './catalog-file-write.js';
import { withCatalogBackupSpool } from './catalog-backup-spool.js';
import { readCatalogReferences } from './catalog-references.js';
import { writeCatalogDelta } from './catalog-delta-write.js';
import { mediaBackupPart } from '../../shared/media-backup-part.js';
import { KNOWLEDGE_VERSION_STORE_MAX_BYTES } from '../../shared/knowledge-history.js';
import { expandKnowledgeVersions, knowledgeVersionError } from '../knowledge-version-blobs.js';
import { expandKnowledgeBodies, knowledgeBodyError } from '../knowledge-body-store.js';
import { KNOWLEDGE_BODY_MAX_BYTES } from '../../shared/knowledge-body.js';
import { knowledgeSearchError, SEARCH_OBJECT_MAX_BYTES } from '../knowledge-search-store.js';
import { materializeKnowledgeMetadata, stageKnowledgeMetadata, knowledgeMetadataError, KNOWLEDGE_METADATA_MAX_BYTES } from './knowledge-metadata-shards.js';

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
  catalogParts = new Map();
  metadataRoots = new WeakMap();
  fileWriteRoots = new WeakMap();
  catalogPartBytes = 0;
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

  constructor({ scope } = {}) {
    Object.assign(this, drivePreparedBackups(this));
    Object.assign(this, driveKnowledgeImportJournals(this));
    Object.assign(this, driveKnowledgeInventory(this));
    this.scope = scope;
    this.allowBootstrap = false;
    if (scope) {
      this.parentFolderId = this.rootFolderId;
      this.rootFolderId = null;
      this.databaseFileId = null;
      this.documentFileIds = { knowledge: null, bookmarks: null };
      this.pushSubscriptionsFileId = this.notificationDeliveryFileId = this.authSessionsFileId = null;
      this.uploadsFolderId = this.backupsFolderId = null;
    }
  }

  assertBootstrapAllowed() {
    if (!this.scope || !this.allowBootstrap) assertMetadataBootstrapAllowed();
  }

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
      if (!this.rootFolderId && !this.parentFolderId) {
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
    if (!this.rootFolderId) {
      if (this.scope) {
        const parent = this.parentFolderId || (await this.getOrCreateRootFolder());
        this.rootFolderId = await this.getOrCreateFolder(`workspace-${this.scope}`, parent);
      } else this.rootFolderId = await this.getOrCreateRootFolder();
    }
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
    this.assertBootstrapAllowed();

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

  async readDatabaseRoot(options = {}) {
    options.signal?.throwIfAborted();
    await this.init();
    options.signal?.throwIfAborted();
    const fileId = await this.findDatabaseFile();
    options.signal?.throwIfAborted();
    if (!fileId) return null;
    const response = await this.readVersionedJson(fileId);
    const etag = responseHeader(response, 'etag');
    this.databaseEtag = etag;
    this.lastSyncAt = new Date().toISOString();
    const raw = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
    const root = await materializeKnowledgeMetadata(raw, this, options);
    this.catalogRoot = root;
    return rememberStorageVersion(root, etag);
  }

  async readCatalogPart(id, descriptor, signal) {
    signal?.throwIfAborted();
    const key = descriptor && `${id}:${descriptor.sha256}`;
    if (key && this.catalogParts.has(key)) {
      const text = this.catalogParts.get(key);
      this.catalogParts.delete(key);
      this.catalogParts.set(key, text);
      return text;
    }
    const part = await this.client.files.get({ fileId: id, alt: 'media', supportsAllDrives: true }, { responseType: 'text', ...(signal ? { signal } : {}) });
    signal?.throwIfAborted();
    // Only immutable, checksum-verified bytes enter this bounded process cache.
    // Each request still reads the current root and checks project ACLs first.
    if (
      key &&
      typeof part.data === 'string' &&
      Buffer.byteLength(part.data) === descriptor.bytes &&
      createHash('sha256').update(part.data).digest('hex') === descriptor.sha256
    ) {
      if (this.catalogParts.has(key)) {
        this.catalogPartBytes -= Buffer.byteLength(this.catalogParts.get(key));
        this.catalogParts.delete(key);
      }
      while (this.catalogPartBytes + descriptor.bytes > 8 * 1024 * 1024 && this.catalogParts.size) {
        const oldest = this.catalogParts.keys().next().value;
        this.catalogPartBytes -= Buffer.byteLength(this.catalogParts.get(oldest));
        this.catalogParts.delete(oldest);
      }
      if (descriptor.bytes <= 8 * 1024 * 1024) {
        this.catalogParts.set(key, part.data);
        this.catalogPartBytes += descriptor.bytes;
      }
    }
    return part.data;
  }

  async loadDatabase() {
    const root = await this.readDatabaseRoot();
    if (!root) return null;
    return rememberStorageVersion(await materializeCatalog(root, (id, part) => this.readCatalogPart(id, part)), storageVersion(root));
  }

  async loadDatabaseCore({ identities = true, knowledge = true, knowledgeIds, knowledgeFields, knowledgeAuthorize, knowledgeSignal } = {}) {
    const root = await this.readDatabaseRoot({ knowledge, ids: knowledgeIds, fields: knowledgeFields, authorize: knowledgeAuthorize, signal: knowledgeSignal });
    if (!root) return null;
    const core = [2, 3].includes(root._fileCatalog?.version)
      ? catalogCore(root, { identities })
      : await materializeCatalog(root, (id, part) => this.readCatalogPart(id, part, knowledgeSignal));
    return rememberStorageVersion(core, storageVersion(root));
  }

  async loadDatabaseMetadata({ knowledge = true } = {}) {
    const root = await this.readDatabaseRoot({ knowledge });
    const core = metadataWriteBase(root);
    if (!core) return null; // Legacy storage must take the canonical write path.
    const data = rememberStorageVersion(structuredClone(core), storageVersion(root));
    this.metadataRoots.set(data, { root, fileId: this.databaseFileId, version: storageVersion(root) });
    return data;
  }

  async loadDatabaseForBackup(expectedEtag) {
    // Only an exact, freshly read root version can authorize reuse of a full
    // canonical snapshot. Revision numbers and mutable provider cursors cannot.
    const root = await this.readDatabaseRoot();
    if (root && expectedEtag && storageVersion(root) === expectedEtag && (!root._fileCatalog || [2, 3].includes(root._fileCatalog.version))) {
      if (root._fileCatalog) catalogCore(root, { identities: false }); // Validate sharded manifests even on a cache hit.
      return { unchanged: true };
    }
    const data = root ? await materializeCatalog(root, (id, part) => this.readCatalogPart(id, part)) : null;
    return { unchanged: false, data: data && rememberStorageVersion(data, storageVersion(root)) };
  }

  async loadDatabaseUploadState(physicalKey) {
    const root = await this.readDatabaseRoot({ knowledge: false });
    if (!root) return null;
    const refs = metadataWriteBase(root) && readCatalogReferences(root);
    const data =
      refs && !refs.has(physicalKey) ? catalogCore(root, { identities: false }) : await materializeCatalog(root, (id, part) => this.readCatalogPart(id, part));
    return rememberStorageVersion(data, storageVersion(root));
  }

  async loadDatabaseFilePatch(ids, authorize, options = {}) {
    const root = await this.readDatabaseRoot({ knowledge: false });
    if (!metadataWriteBase(root)) return null;
    const data = rememberStorageVersion(catalogCore(root), storageVersion(root));
    // Authorization/classification happens against this exact latest root,
    // before reading a single immutable record (including private projects).
    if (!(await authorize(data))) return null;
    if (options.delta) {
      const refs = readCatalogReferences(root);
      if (!refs || (options.physicalKey && refs.has(options.physicalKey))) return null;
    }
    conditionalWriteOptions({ expectedEtag: storageVersion(root) });
    const selected = new Set(ids);
    if (options.project) {
      const part = root._fileCatalog.shards.find(part => part.project === options.project && part.count < 2000 && part.bytes < 1.75 * 1024 * 1024);
      if (part) selected.add(part.keys[0][0]);
    }
    const files = await readCatalogShards(root, (id, part) => this.readCatalogPart(id, part), { ids: selected });
    const snapshot = { data, files };
    this.fileWriteRoots.set(snapshot, { root, files: structuredClone(files), fileId: this.databaseFileId, version: storageVersion(root) });
    return snapshot;
  }

  async saveDatabaseFileDelta(snapshot, next, assertOwnership) {
    const source = this.fileWriteRoots.get(snapshot);
    if (!source?.fileId || source.version !== storageVersion(snapshot.data))
      throw Object.assign(new Error('Reload the catalog snapshot before saving.'), { code: 'STORAGE_VERSION_MISSING', statusCode: 503 });
    const options = conditionalWriteOptions({ expectedEtag: source.version });
    const logical = await writeCatalogDelta(source.root, source.files, next, async (text, hash) => {
      await assertOwnership?.();
      const result = await this.client.files.create({
        requestBody: { name: `smena-catalog-${hash}.json`, parents: [this.rootFolderId], mimeType: 'application/json' },
        media: { mimeType: 'application/json', body: Readable.from([text]) },
        fields: 'id',
        supportsAllDrives: true,
      });
      return result.data.id;
    });
    const stored = await stageKnowledgeMetadata(logical, this, source.root);
    await assertOwnership?.();
    const updated = await this.updateVersionedJson(
      {
        fileId: source.fileId,
        requestBody: { appProperties: { smenaRevision: String(next.revision) } },
        media: { mimeType: 'application/json', body: Readable.from([JSON.stringify(stored, null, 2)]) },
        supportsAllDrives: true,
      },
      options,
    );
    this.databaseEtag = responseHeader(updated, 'etag');
    this.catalogRoot = stored;
    this.lastSyncAt = new Date().toISOString();
    this.fileWriteRoots.delete(snapshot);
    return rememberStorageVersion(catalogCore(logical), this.databaseEtag);
  }

  async saveDatabaseFilePatch(snapshot, files, tasks, revision, updatedAt, assertOwnership) {
    const source = this.fileWriteRoots.get(snapshot);
    if (!source?.fileId || source.version !== storageVersion(snapshot.data))
      throw Object.assign(new Error('Reload the file snapshot before saving.'), { statusCode: 503, code: 'STORAGE_VERSION_MISSING' });
    const options = conditionalWriteOptions({ expectedEtag: source.version });
    const logical = await writeFileMetadataParts(source.root, source.files, files, tasks, revision, updatedAt, async (text, hash) => {
      await assertOwnership?.();
      const result = await this.client.files.create({
        requestBody: { name: `smena-catalog-${hash}.json`, parents: [this.rootFolderId], mimeType: 'application/json' },
        media: { mimeType: 'application/json', body: Readable.from([text]) },
        fields: 'id',
        supportsAllDrives: true,
      });
      return result.data.id;
    });
    const stored = await stageKnowledgeMetadata(logical, this, source.root);
    // Staging may outlive a coordination lease; check again at publication.
    await assertOwnership?.();
    const result = await this.updateVersionedJson(
      {
        fileId: source.fileId,
        requestBody: { appProperties: { smenaRevision: String(revision) } },
        media: { mimeType: 'application/json', body: Readable.from([JSON.stringify(stored, null, 2)]) },
        supportsAllDrives: true,
      },
      options,
    );
    this.databaseEtag = responseHeader(result, 'etag');
    this.catalogRoot = stored;
    this.lastSyncAt = new Date().toISOString();
    this.fileWriteRoots.delete(snapshot);
    return rememberStorageVersion(catalogCore(logical), this.databaseEtag);
  }

  async saveDatabaseMetadata(next, baseline, { scope, memberId } = {}) {
    // A projection, mutable provider cursor or client-supplied root cannot be
    // substituted for the exact snapshot issued by loadDatabaseMetadata.
    const snapshot = this.metadataRoots.get(baseline);
    if (!snapshot || !snapshot.fileId || snapshot.version !== storageVersion(baseline))
      throw Object.assign(new Error('Reload the metadata snapshot before saving.'), { statusCode: 503, code: 'STORAGE_VERSION_MISSING' });
    const options = conditionalWriteOptions({ expectedEtag: snapshot.version });
    const logical = patchCatalogMetadata(snapshot.root, baseline, next, scope, memberId);
    const stored = await stageKnowledgeMetadata(logical, this, snapshot.root, { unchangedKnowledge: !scope.startsWith('knowledge') });
    const updated = await this.updateVersionedJson(
      {
        fileId: snapshot.fileId,
        requestBody: { appProperties: { smenaRevision: String(next.revision) } },
        media: { mimeType: 'application/json', body: Readable.from([JSON.stringify(stored, null, 2)]) },
        supportsAllDrives: true,
      },
      options,
    );
    this.databaseEtag = responseHeader(updated, 'etag');
    this.catalogRoot = stored;
    this.lastSyncAt = new Date().toISOString();
    rememberStorageVersion(next, this.databaseEtag);
    this.metadataRoots.delete(baseline);
    // Preference responses pass through project ACL projection and demand
    // catalog hydration. Identity rows preserve file relations/counts there;
    // document responses need no identity allocation at all.
    if (stored._knowledgeCatalog) logical._knowledgeCatalog = structuredClone(stored._knowledgeCatalog);
    return rememberStorageVersion(catalogCore(logical, { identities: scope === 'preferences' }), this.databaseEtag);
  }

  async loadDatabaseStatus() {
    const root = await this.readDatabaseRoot({ knowledge: false });
    if (!root) return null;
    const accounting = [2, 3].includes(root._fileCatalog?.version) ? readCatalogAccounting(root) : null;
    // Capacity needs neither full records nor an O(files) array of identity
    // objects. Validate the manifest but retain no catalog rows in this model.
    const data = accounting ? catalogCore(root, { identities: false }) : await materializeCatalog(root, (id, part) => this.readCatalogPart(id, part));
    return {
      data: rememberStorageVersion(data, storageVersion(root)),
      accounting,
      catalog: {
        layout: root._fileCatalog ? 'project-shards' : 'aggregate',
        version: root._fileCatalog?.version || 0,
        parts: root._fileCatalog?.shards?.length || 0,
      },
    };
  }

  async loadDatabaseCatalog(select, projectFile, search = false, { signal } = {}) {
    signal?.throwIfAborted();
    const root = await this.readDatabaseRoot({ knowledge: false, signal });
    if (!root) return null;
    if (![2, 3].includes(root._fileCatalog?.version)) {
      const data = await materializeCatalog(root, id => this.readCatalogPart(id, undefined, signal));
      return rememberStorageVersion(projectFile ? { ...data, files: data.files.map(projectFile) } : data, storageVersion(root));
    }
    const core = catalogCore(root);
    const files = await readCatalogShards(root, (id, part) => this.readCatalogPart(id, part, signal), select(core), projectFile, search);
    return rememberStorageVersion({ ...core, _catalogIndex: core.files, files }, storageVersion(root));
  }

  async loadDatabaseCatalogIndex(select, options = {}) {
    return this.loadDatabaseCatalog(select, fileCatalogIndex, true, options);
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
    if (data.schemaVersion >= 3 && Array.isArray(data.files) && data._catalogLayout !== 'aggregate') {
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
    stored = await stageKnowledgeMetadata(stored, this, this.catalogRoot);
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
      this.assertBootstrapAllowed();
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
    if (stored._knowledgeCatalog) data._knowledgeCatalog = structuredClone(stored._knowledgeCatalog);
  }

  async setFileCatalogLayout(layout, expectedRevision) {
    if (!['aggregate', 'project-shards'].includes(layout) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
      throw new TypeError('Invalid catalog layout operation.');
    // Always materialize the latest root. Replaying the pre-migration backup
    // here would silently discard subsequent team edits.
    const data = await this.loadDatabase();
    if (!data || data.revision !== expectedRevision)
      throw Object.assign(new Error('Reload the workspace before changing catalog layout.'), { code: 'REVISION_CONFLICT', statusCode: 409 });
    if (Number(data.schemaVersion || 1) > 3) throw new Error('The workspace uses a newer schema.');
    const backup = await this.createDatabaseBackup(data, 'Before file catalog layout change');
    await this.saveDatabase({ ...data, schemaVersion: 3, _catalogLayout: layout }, { expectedEtag: storageVersion(data) });
    return { layout, revision: data.revision, backupId: backup.id };
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
      this.assertBootstrapAllowed();
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
    this.assertBootstrapAllowed();
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
    this.assertBootstrapAllowed();
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
    this.assertBootstrapAllowed();
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
    return this.uploadDatabaseBackup(data, label);
  }

  async findKnowledgeVersion(hash) {
    if (!/^[a-f0-9]{64}$/.test(hash || '')) throw knowledgeVersionError('KNOWLEDGE_VERSION_INTEGRITY');
    await this.init();
    const result = await this.client.files.list({
      q: `name = 'smena-knowledge-version-${hash}.json' and '${escapeDriveQuery(this.rootFolderId)}' in parents and trashed = false and appProperties has { key='smenaKnowledgeVersion' and value='1' }`,
      fields: 'files(id,size)',
      spaces: 'drive',
      pageSize: 2,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });
    return uniqueDriveMatch(result);
  }
  async findKnowledgeBody(hash) {
    if (!/^[a-f0-9]{64}$/.test(hash || '')) throw knowledgeBodyError();
    await this.init();
    const result = await this.client.files.list({
      q: `name = 'smena-knowledge-body-${hash}.json' and '${escapeDriveQuery(this.rootFolderId)}' in parents and trashed = false and appProperties has { key='smenaKnowledgeBody' and value='1' }`,
      fields: 'files(id,size)',
      spaces: 'drive',
      pageSize: 2,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });
    return uniqueDriveMatch(result);
  }
  async findKnowledgeSearch(hash, { signal } = {}) {
    signal?.throwIfAborted();
    if (!/^[a-f0-9]{64}$/.test(hash || '')) throw knowledgeSearchError();
    await this.init();
    signal?.throwIfAborted();
    const result = await this.client.files.list(
      {
        q: `name = 'smena-knowledge-search-${hash}.json' and '${escapeDriveQuery(this.rootFolderId)}' in parents and trashed = false and appProperties has { key='smenaKnowledgeSearch' and value='1' }`,
        fields: 'files(id,size)',
        spaces: 'drive',
        pageSize: 2,
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
      },
      signal ? { signal } : undefined,
    );
    return uniqueDriveMatch(result);
  }
  async findKnowledgeMetadata(hash, { signal } = {}) {
    signal?.throwIfAborted();
    if (!/^[a-f0-9]{64}$/.test(hash || '')) throw knowledgeMetadataError();
    await this.init();
    signal?.throwIfAborted();
    const result = await this.client.files.list(
      {
        q: `name = 'smena-knowledge-metadata-${hash}.json' and '${escapeDriveQuery(this.rootFolderId)}' in parents and trashed = false and appProperties has { key='smenaKnowledgeMetadata' and value='1' }`,
        fields: 'files(id,size)',
        spaces: 'drive',
        pageSize: 2,
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
      },
      signal ? { signal } : undefined,
    );
    return uniqueDriveMatch(result);
  }
  async readKnowledgeMetadata(hash, { signal } = {}) {
    signal?.throwIfAborted();
    const file = await this.findKnowledgeMetadata(hash, { signal });
    if (!file || Number(file.size) > KNOWLEDGE_METADATA_MAX_BYTES) throw knowledgeMetadataError();
    return (await this.client.files.get({ fileId: file.id, alt: 'media', supportsAllDrives: true }, { responseType: 'text', ...(signal ? { signal } : {}) }))
      .data;
  }
  async writeKnowledgeMetadata(text, hash) {
    if (typeof text !== 'string' || Buffer.byteLength(text) > KNOWLEDGE_METADATA_MAX_BYTES || createHash('sha256').update(text).digest('hex') !== hash)
      throw knowledgeMetadataError();
    const existing = await this.findKnowledgeMetadata(hash);
    if (existing) {
      if ((await this.readKnowledgeMetadata(hash)) !== text) throw knowledgeMetadataError();
      return;
    }
    await this.client.files.create({
      requestBody: {
        name: `smena-knowledge-metadata-${hash}.json`,
        parents: [this.rootFolderId],
        mimeType: 'application/json',
        appProperties: { smenaKnowledgeMetadata: '1' },
      },
      media: { mimeType: 'application/json', body: Readable.from([text]) },
      fields: 'id',
      supportsAllDrives: true,
    });
  }
  async readKnowledgeSearch(hash, { signal } = {}) {
    signal?.throwIfAborted();
    const file = await this.findKnowledgeSearch(hash, { signal });
    if (!file || Number(file.size) > SEARCH_OBJECT_MAX_BYTES) throw knowledgeSearchError();
    return (await this.client.files.get({ fileId: file.id, alt: 'media', supportsAllDrives: true }, { responseType: 'text', ...(signal ? { signal } : {}) }))
      .data;
  }
  async writeKnowledgeSearch(text, hash) {
    if (typeof text !== 'string' || Buffer.byteLength(text) > SEARCH_OBJECT_MAX_BYTES || createHash('sha256').update(text).digest('hex') !== hash)
      throw knowledgeSearchError();
    const existing = await this.findKnowledgeSearch(hash);
    if (existing) {
      const response = await this.client.files.get({ fileId: existing.id, alt: 'media', supportsAllDrives: true }, { responseType: 'text' });
      if (response.data !== text) throw knowledgeSearchError();
      return;
    }
    await this.client.files.create({
      requestBody: {
        name: `smena-knowledge-search-${hash}.json`,
        parents: [this.rootFolderId],
        mimeType: 'application/json',
        appProperties: { smenaKnowledgeSearch: '1' },
      },
      media: { mimeType: 'application/json', body: Readable.from([text]) },
      fields: 'id',
      supportsAllDrives: true,
    });
  }
  async readKnowledgeBody(hash) {
    const file = await this.findKnowledgeBody(hash);
    if (!file) throw knowledgeBodyError();
    if (Number(file.size) > KNOWLEDGE_BODY_MAX_BYTES) throw knowledgeBodyError();
    const response = await this.client.files.get({ fileId: file.id, alt: 'media', supportsAllDrives: true }, { responseType: 'text' });
    return response.data;
  }
  async writeKnowledgeBody(text, hash) {
    if (typeof text !== 'string' || createHash('sha256').update(text).digest('hex') !== hash) throw knowledgeBodyError();
    if (Buffer.byteLength(text) > KNOWLEDGE_BODY_MAX_BYTES) throw knowledgeBodyError('KNOWLEDGE_BODY_LIMIT', 413);
    const existing = await this.findKnowledgeBody(hash);
    if (existing) {
      const response = await this.client.files.get({ fileId: existing.id, alt: 'media', supportsAllDrives: true }, { responseType: 'text' });
      if (response.data !== text) throw knowledgeBodyError();
      return;
    }
    await this.client.files.create({
      requestBody: {
        name: `smena-knowledge-body-${hash}.json`,
        parents: [this.rootFolderId],
        mimeType: 'application/json',
        appProperties: { smenaKnowledgeBody: '1' },
      },
      media: { mimeType: 'application/json', body: Readable.from([text]) },
      fields: 'id',
      supportsAllDrives: true,
    });
  }
  async readKnowledgeVersion(hash) {
    const file = await this.findKnowledgeVersion(hash);
    if (!file) throw knowledgeVersionError('KNOWLEDGE_VERSION_INTEGRITY');
    const response = await this.client.files.get({ fileId: file.id, alt: 'media', supportsAllDrives: true }, { responseType: 'text' });
    return response.data;
  }
  async writeKnowledgeVersion(text, hash) {
    const existing = await this.findKnowledgeVersion(hash);
    if (existing) {
      const response = await this.client.files.get({ fileId: existing.id, alt: 'media', supportsAllDrives: true }, { responseType: 'text' });
      if (response.data !== text) throw knowledgeVersionError('KNOWLEDGE_VERSION_INTEGRITY');
      return;
    }
    let total = 0,
      pageToken;
    do {
      const result = await this.client.files.list({
        q: `'${escapeDriveQuery(this.rootFolderId)}' in parents and trashed = false and appProperties has { key='smenaKnowledgeVersion' and value='1' }`,
        fields: 'nextPageToken,files(size)',
        spaces: 'drive',
        pageSize: 1000,
        pageToken,
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
      });
      for (const file of result.data.files || []) total += Number(file.size) || 0;
      pageToken = result.data.nextPageToken;
    } while (pageToken);
    if (total + Buffer.byteLength(text) > KNOWLEDGE_VERSION_STORE_MAX_BYTES) throw knowledgeVersionError('KNOWLEDGE_HISTORY_STORAGE_LIMIT', 413);
    await this.client.files.create({
      requestBody: {
        name: `smena-knowledge-version-${hash}.json`,
        parents: [this.rootFolderId],
        mimeType: 'application/json',
        appProperties: { smenaKnowledgeVersion: '1' },
      },
      media: { mimeType: 'application/json', body: Readable.from([text]) },
      fields: 'id',
      supportsAllDrives: true,
    });
  }

  async createColdDatabaseBackup(label, validateCore) {
    const root = await this.readDatabaseRoot();
    const core = metadataWriteBase(root);
    if (!core || !(await validateCore(core))) return null;
    try {
      return await withCatalogBackupSpool(
        root,
        (id, part) => this.readCatalogPart(id, part),
        (data, records) => this.uploadDatabaseBackup(data, label, records),
      );
    } catch (error) {
      if (error.code === 'BACKUP_CANONICAL_REQUIRED') return null;
      throw error;
    }
  }

  async uploadDatabaseBackup(data, label = '', records) {
    data = await expandKnowledgeBodies(data, this);
    data = await expandKnowledgeVersions(data, this);
    const folderId = await this.ensureBackupsFolder();
    const createdAt = new Date().toISOString();
    let size = 0;
    const body = Readable.from(
      (function* () {
        for (const text of backupJson(data, createdAt, label, records)) {
          size += Buffer.byteLength(text);
          yield text;
        }
      })(),
    );
    const created = await this.client.files.create({
      requestBody: {
        name: `smena-manager-backup-${createdAt.replace(/[:.]/g, '-')}.json`,
        parents: [folderId],
        mimeType: 'application/json',
        appProperties: { smenaBackup: 'true', label: String(label || '').slice(0, 120) },
      },
      media: { mimeType: 'application/json', body },
      fields: 'id,name,createdTime,size,appProperties',
      supportsAllDrives: true,
    });
    return {
      id: created.data.id,
      createdAt: created.data.createdTime || createdAt,
      label: created.data.appProperties?.label || String(label || ''),
      size: Number(created.data.size) || size,
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
    const seen = new Set();
    return files
      .filter(file => {
        const key = file.appProperties?.smenaPreparedKey;
        if (!/^[a-f0-9]{64}$/.test(key || '')) return true;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map(file => ({
        id: file.id,
        createdAt: file.createdTime,
        label: file.appProperties?.label || '',
        size: Number(file.appProperties?.snapshotBytes || file.size) || 0,
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
    if (stored?.format === 'smena-prepared-backup-v1') return restorePreparedBackup(this, stored);
    if (!stored?.data || typeof stored.data !== 'object') throw new Error('Backup data is invalid.');
    return stored.data;
  }

  async deleteDatabaseBackup(id) {
    const folderId = await this.ensureBackupsFolder();
    const metadata = await this.client.files.get({ fileId: id, fields: 'id,parents,trashed,appProperties', supportsAllDrives: true });
    if (metadata.data.trashed || !metadata.data.parents?.includes(folderId) || metadata.data.appProperties?.smenaBackup !== 'true') {
      throw new Error('Backup is unavailable.');
    }
    if (metadata.data.appProperties?.smenaPreparedKey) return this.deletePreparedBackupCopies(metadata.data.appProperties.smenaPreparedKey);
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

  async copyMediaObject(file, filename, { fromBackup = false, toBackup = true, sourceStorage = this } = {}) {
    await this.init();
    await sourceStorage.init();
    const sourceFolder = fromBackup ? await sourceStorage.ensureBackupsFolder() : await sourceStorage.ensureUploadsFolder();
    const targetFolder = toBackup ? await this.ensureBackupsFolder() : await this.ensureUploadsFolder();
    const read = async () =>
      (await this.client.files.get({ fileId: file.storageFileId, fields: 'id,name,size,md5Checksum,parents,trashed', supportsAllDrives: true })).data;
    const before = await read();
    if (
      before.trashed ||
      before.name !== file.storageName ||
      !before.parents?.includes(sourceFolder) ||
      Number(before.size) !== file.bytes ||
      !before.md5Checksum ||
      (file.checksum && file.checksum !== before.md5Checksum)
    )
      throw Object.assign(Error('Media source changed or is unavailable.'), { code: 'MEDIA_SOURCE_CHANGED', statusCode: 409 });
    const found = await this.client.files.list({
      q: `name = '${escapeDriveQuery(filename)}' and '${escapeDriveQuery(targetFolder)}' in parents and trashed = false`,
      fields: 'files(id,name,size,md5Checksum)',
      pageSize: 2,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    if ((found.data.files || []).length > 1) throw Error('Ambiguous media copy.');
    const copied =
      found.data.files?.[0] ||
      (
        await this.client.files.copy({
          fileId: before.id,
          requestBody: { name: filename, parents: [targetFolder] },
          fields: 'id,name,size,md5Checksum',
          supportsAllDrives: true,
        })
      ).data;
    const after = await read();
    if (
      after.md5Checksum !== before.md5Checksum ||
      Number(after.size) !== file.bytes ||
      copied.md5Checksum !== before.md5Checksum ||
      Number(copied.size) !== file.bytes
    )
      throw Error('Media copy integrity check failed.');
    return { storageFileId: copied.id, storageName: copied.name, bytes: Number(copied.size), checksum: copied.md5Checksum };
  }

  async saveMediaManifest(job) {
    const folder = await this.ensureBackupsFolder();
    const filename = `media-manifest-${job.id}.json`;
    const existing = await this.client.files.list({
      q: `name = '${escapeDriveQuery(filename)}' and '${escapeDriveQuery(folder)}' in parents and trashed = false`,
      fields: 'files(id)',
      pageSize: 1,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    if (existing.data.files?.length) return;
    await this.client.files.create({
      requestBody: { name: filename, parents: [folder], appProperties: { smenaMediaManifest: 'true' } },
      media: { mimeType: 'application/json', body: Readable.from([JSON.stringify({ format: 'smena-media-v1', ...job })]) },
      fields: 'id',
      supportsAllDrives: true,
    });
  }

  async readMediaManifest(id) {
    if (!/^[a-f0-9-]{36}$/i.test(id || '')) throw new TypeError('Invalid media manifest.');
    await this.init();
    const folder = await this.ensureBackupsFolder();
    const found = await this.client.files.list({
      q: `name = 'media-manifest-${id}.json' and '${escapeDriveQuery(folder)}' in parents and trashed = false`,
      fields: 'files(id,size,appProperties)',
      pageSize: 2,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    const items = found.data.files || [];
    if (items.length !== 1 || items[0].appProperties?.smenaMediaManifest !== 'true' || Number(items[0].size) > 2 * 1024 * 1024)
      throw Object.assign(Error('Verified media manifest is unavailable.'), { statusCode: 403, code: 'MEDIA_MANIFEST_UNAVAILABLE' });
    const response = await this.client.files.get({ fileId: items[0].id, alt: 'media', supportsAllDrives: true }, { responseType: 'json' });
    return typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
  }

  async verifyMediaBackupObject(file) {
    await this.init();
    const folder = await this.ensureBackupsFolder();
    const { data } = await this.client.files.get({ fileId: file.storageFileId, fields: 'name,size,md5Checksum,parents,trashed', supportsAllDrives: true });
    if (
      data.trashed ||
      data.name !== file.storageName ||
      !data.parents?.includes(folder) ||
      Number(data.size) !== file.bytes ||
      data.md5Checksum !== file.checksum
    )
      throw Object.assign(Error('Media source changed.'), { code: 'MEDIA_SOURCE_CHANGED', statusCode: 409 });
  }

  async removeMediaBackupPart(job, index) {
    await this.init();
    const part = mediaBackupPart(job, index);
    if (!part) return;
    const folder = await this.ensureBackupsFolder();
    let fileId = part.storageFileId;
    if (part.manifest) {
      const found = await this.client.files.list({
        q: `name = '${escapeDriveQuery(part.name)}' and '${escapeDriveQuery(folder)}' in parents and trashed = false`,
        fields: 'files(id)',
        pageSize: 2,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
      if (!found.data.files?.length) return;
      if (found.data.files.length !== 1) throw Error('Ambiguous backup manifest.');
      fileId = found.data.files[0].id;
    }
    let file;
    try {
      file = (await this.client.files.get({ fileId, fields: 'id,name,size,md5Checksum,parents,trashed,appProperties', supportsAllDrives: true })).data;
    } catch (error) {
      if (Number(error.code) === 404 || error.response?.status === 404) return;
      throw error;
    }
    if (file.trashed) return;
    if (
      file.name !== part.name ||
      !file.parents?.includes(folder) ||
      (part.manifest ? file.appProperties?.smenaMediaManifest !== 'true' : Number(file.size) !== part.bytes || file.md5Checksum !== part.checksum)
    )
      throw Object.assign(Error('Backup identity changed.'), { code: 'MEDIA_SOURCE_CHANGED', statusCode: 409 });
    await this.client.files.update({ fileId, requestBody: { trashed: true }, supportsAllDrives: true });
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
      fileCatalog: {
        layout: this.catalogRoot?._fileCatalog ? 'project-shards' : 'aggregate',
        version: this.catalogRoot?._fileCatalog?.version || 0,
        parts: this.catalogRoot?._fileCatalog?.shards?.length || 0,
      },
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
