import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { mediaBackupPart } from '../../shared/media-backup-part.js';
import { KNOWLEDGE_VERSION_STORE_MAX_BYTES } from '../../shared/knowledge-history.js';
import { expandKnowledgeVersions, knowledgeVersionError } from '../knowledge-version-blobs.js';
import { expandKnowledgeBodies, knowledgeBodyError } from '../knowledge-body-store.js';
import { KNOWLEDGE_BODY_MAX_BYTES } from '../../shared/knowledge-body.js';
import { knowledgeSearchError, SEARCH_OBJECT_MAX_BYTES } from '../knowledge-search-store.js';
import { materializeKnowledgeMetadata, stageKnowledgeMetadata, knowledgeMetadataError, KNOWLEDGE_METADATA_MAX_BYTES } from './knowledge-metadata-shards.js';

const WINDOWS_RENAME_RETRIES = 4;
const WINDOWS_RENAME_DELAY_MS = 25;

async function renameWithRetry(source, destination) {
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.promises.rename(source, destination);
      return;
    } catch (error) {
      const retryable = process.platform === 'win32' && ['EACCES', 'EBUSY', 'EPERM'].includes(error?.code);
      if (!retryable || attempt >= WINDOWS_RENAME_RETRIES) throw error;
      await new Promise(resolve => setTimeout(resolve, WINDOWS_RENAME_DELAY_MS * 2 ** attempt));
    }
  }
}

export class LocalStorageProvider {
  name = 'local';

  constructor(databasePath = process.env.DATABASE_PATH || path.join(process.cwd(), '.data', 'smena-manager-data.json'), options = {}) {
    this.databasePath = path.resolve(databasePath);
    this.pushSubscriptionsPath = path.resolve(path.join(path.dirname(this.databasePath), 'push-subscriptions.json'));
    this.notificationDeliveryPath = path.resolve(path.join(path.dirname(this.databasePath), 'notification-delivery-status.json'));
    this.authSessionsPath = path.resolve(path.join(path.dirname(this.databasePath), 'auth-sessions.json'));
    this.uploadsPath = path.resolve(options.uploadsPath || process.env.UPLOADS_PATH || path.join(path.dirname(this.databasePath), 'uploads'));
    this.backupsPath = path.resolve(options.backupsPath || process.env.BACKUPS_PATH || path.join(path.dirname(this.databasePath), 'backups'));
  }

  documentPath(name) {
    if (!['knowledge', 'bookmarks'].includes(name)) throw new Error('Invalid workspace document name.');
    return path.join(path.dirname(this.databasePath), `smena-manager-${name}.json`);
  }

  async init() {
    await fs.promises.mkdir(path.dirname(this.databasePath), { recursive: true });
    await fs.promises.mkdir(this.uploadsPath, { recursive: true });
    await fs.promises.mkdir(this.backupsPath, { recursive: true });
  }

  async loadDatabase() {
    return this.readDatabaseRoot();
  }

  async loadDatabaseCore(options = {}) {
    return this.readDatabaseRoot(options);
  }

  async readDatabaseRoot({ knowledge = true, knowledgeIds, knowledgeFields, knowledgeAuthorize, knowledgeSignal } = {}) {
    knowledgeSignal?.throwIfAborted();
    try {
      const value = await fs.promises.readFile(this.databasePath, 'utf8');
      this.knowledgeRoot = JSON.parse(value);
      return await materializeKnowledgeMetadata(this.knowledgeRoot, this, {
        knowledge,
        ids: knowledgeIds,
        fields: knowledgeFields,
        authorize: knowledgeAuthorize,
        signal: knowledgeSignal,
      });
    } catch (error) {
      if (error?.code === 'ENOENT') return null;
      throw error;
    }
  }

  knowledgeVersionPath(hash) {
    if (!/^[a-f0-9]{64}$/.test(hash || '')) throw knowledgeVersionError('KNOWLEDGE_VERSION_INTEGRITY');
    return path.join(path.dirname(this.databasePath), 'knowledge-versions', `${hash}.json`);
  }
  knowledgeBodyPath(hash) {
    if (!/^[a-f0-9]{64}$/.test(hash || '')) throw knowledgeBodyError();
    return path.join(path.dirname(this.databasePath), 'knowledge-bodies', `${hash}.json`);
  }
  knowledgeSearchPath(hash) {
    if (!/^[a-f0-9]{64}$/.test(hash || '')) throw knowledgeSearchError();
    return path.join(path.dirname(this.databasePath), 'knowledge-search', `${hash}.json`);
  }
  knowledgeMetadataPath(hash) {
    if (!/^[a-f0-9]{64}$/.test(hash || '')) throw knowledgeMetadataError();
    return path.join(path.dirname(this.databasePath), 'knowledge-metadata', `${hash}.json`);
  }
  async readKnowledgeMetadata(hash, { signal } = {}) {
    signal?.throwIfAborted();
    const target = this.knowledgeMetadataPath(hash);
    if ((await fs.promises.stat(target)).size > KNOWLEDGE_METADATA_MAX_BYTES) throw knowledgeMetadataError();
    return fs.promises.readFile(target, { encoding: 'utf8', signal });
  }
  async writeKnowledgeMetadata(text, hash) {
    const target = this.knowledgeMetadataPath(hash);
    if (typeof text !== 'string' || Buffer.byteLength(text) > KNOWLEDGE_METADATA_MAX_BYTES || crypto.createHash('sha256').update(text).digest('hex') !== hash)
      throw knowledgeMetadataError();
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
    try {
      await fs.promises.writeFile(temporary, text, { encoding: 'utf8', flag: 'wx' });
      try {
        await fs.promises.link(temporary, target);
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        if ((await fs.promises.readFile(target, 'utf8')) !== text) throw knowledgeMetadataError();
      }
    } finally {
      await fs.promises.unlink(temporary).catch(() => undefined);
    }
  }
  async readKnowledgeSearch(hash, { signal } = {}) {
    signal?.throwIfAborted();
    const target = this.knowledgeSearchPath(hash);
    if ((await fs.promises.stat(target)).size > SEARCH_OBJECT_MAX_BYTES) throw knowledgeSearchError();
    return fs.promises.readFile(target, { encoding: 'utf8', signal });
  }
  async writeKnowledgeSearch(text, hash) {
    if (typeof text !== 'string' || Buffer.byteLength(text) > SEARCH_OBJECT_MAX_BYTES || crypto.createHash('sha256').update(text).digest('hex') !== hash)
      throw knowledgeSearchError();
    const target = this.knowledgeSearchPath(hash),
      temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    try {
      await fs.promises.writeFile(temporary, text, { encoding: 'utf8', flag: 'wx' });
      try {
        await fs.promises.link(temporary, target);
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        if ((await fs.promises.readFile(target, 'utf8')) !== text) throw knowledgeSearchError();
      }
    } finally {
      await fs.promises.unlink(temporary).catch(() => undefined);
    }
  }
  async readKnowledgeBody(hash) {
    return fs.promises.readFile(this.knowledgeBodyPath(hash), 'utf8');
  }
  async writeKnowledgeBody(text, hash) {
    const target = this.knowledgeBodyPath(hash);
    if (typeof text !== 'string' || crypto.createHash('sha256').update(text).digest('hex') !== hash) throw knowledgeBodyError();
    if (Buffer.byteLength(text) > KNOWLEDGE_BODY_MAX_BYTES) throw knowledgeBodyError('KNOWLEDGE_BODY_LIMIT', 413);
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
    try {
      await fs.promises.writeFile(temporary, text, { encoding: 'utf8', flag: 'wx' });
      try {
        // Atomic exclusive publication: a crash cannot expose half-written
        // content under a canonical identity or replace a previous object.
        await fs.promises.link(temporary, target);
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        if ((await fs.promises.readFile(target, 'utf8')) !== text) throw knowledgeBodyError();
      }
    } finally {
      await fs.promises.unlink(temporary).catch(() => undefined);
    }
  }
  async readKnowledgeVersion(hash) {
    return fs.promises.readFile(this.knowledgeVersionPath(hash), 'utf8');
  }
  async writeKnowledgeVersion(text, hash) {
    const target = this.knowledgeVersionPath(hash);
    const directory = path.dirname(target);
    await fs.promises.mkdir(directory, { recursive: true });
    try {
      const existing = await fs.promises.readFile(target, 'utf8');
      if (existing !== text) throw knowledgeVersionError('KNOWLEDGE_VERSION_INTEGRITY');
      return;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    let total = 0;
    for (const entry of await fs.promises.readdir(directory))
      if (/^[a-f0-9]{64}\.json$/.test(entry)) total += (await fs.promises.stat(path.join(directory, entry))).size;
    if (total + Buffer.byteLength(text) > KNOWLEDGE_VERSION_STORE_MAX_BYTES) throw knowledgeVersionError('KNOWLEDGE_HISTORY_STORAGE_LIMIT', 413);
    try {
      await fs.promises.writeFile(target, text, { encoding: 'utf8', flag: 'wx' });
    } catch (error) {
      if (error.code !== 'EEXIST' || (await fs.promises.readFile(target, 'utf8')) !== text) throw error;
    }
  }

  async saveDatabase(data) {
    await this.init();
    const stored = await stageKnowledgeMetadata(data, this, this.knowledgeRoot);
    const temporaryPath = `${this.databasePath}.${process.pid}.${Date.now()}.tmp`;
    try {
      await fs.promises.writeFile(temporaryPath, JSON.stringify(stored, null, 2), 'utf8');
      await renameWithRetry(temporaryPath, this.databasePath);
      this.knowledgeRoot = stored;
      if (stored._knowledgeCatalog) data._knowledgeCatalog = structuredClone(stored._knowledgeCatalog);
    } finally {
      await fs.promises.unlink(temporaryPath).catch(() => undefined);
    }
  }

  async loadDocument(name) {
    try {
      return JSON.parse(await fs.promises.readFile(this.documentPath(name), 'utf8'));
    } catch (error) {
      if (error?.code === 'ENOENT') return null;
      throw error;
    }
  }

  async saveDocument(name, data) {
    await this.init();
    const targetPath = this.documentPath(name);
    const temporaryPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
    try {
      await fs.promises.writeFile(temporaryPath, JSON.stringify(data, null, 2), 'utf8');
      await renameWithRetry(temporaryPath, targetPath);
    } finally {
      await fs.promises.unlink(temporaryPath).catch(() => undefined);
    }
  }

  async loadPushSubscriptions() {
    try {
      const value = await fs.promises.readFile(this.pushSubscriptionsPath, 'utf8');
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      if (error?.code === 'ENOENT') return [];
      throw error;
    }
  }

  async savePushSubscriptions(subscriptions) {
    await this.init();
    const temporaryPath = `${this.pushSubscriptionsPath}.${process.pid}.${Date.now()}.tmp`;
    try {
      await fs.promises.writeFile(temporaryPath, JSON.stringify(subscriptions, null, 2), 'utf8');
      await renameWithRetry(temporaryPath, this.pushSubscriptionsPath);
    } finally {
      await fs.promises.unlink(temporaryPath).catch(() => undefined);
    }
  }

  async loadNotificationDeliveryStatus() {
    try {
      return JSON.parse(await fs.promises.readFile(this.notificationDeliveryPath, 'utf8'));
    } catch (error) {
      if (error?.code === 'ENOENT') return null;
      throw error;
    }
  }

  async saveNotificationDeliveryStatus(status) {
    await this.init();
    const temporaryPath = `${this.notificationDeliveryPath}.${process.pid}.${Date.now()}.tmp`;
    try {
      await fs.promises.writeFile(temporaryPath, JSON.stringify(status, null, 2), 'utf8');
      await renameWithRetry(temporaryPath, this.notificationDeliveryPath);
    } finally {
      await fs.promises.unlink(temporaryPath).catch(() => undefined);
    }
  }

  async loadAuthSessions() {
    try {
      const parsed = JSON.parse(await fs.promises.readFile(this.authSessionsPath, 'utf8'));
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      if (error?.code === 'ENOENT') return [];
      throw error;
    }
  }

  async saveAuthSessions(sessions) {
    await this.init();
    const temporaryPath = `${this.authSessionsPath}.${process.pid}.${Date.now()}.tmp`;
    try {
      await fs.promises.writeFile(temporaryPath, JSON.stringify(sessions, null, 2), 'utf8');
      await renameWithRetry(temporaryPath, this.authSessionsPath);
    } finally {
      await fs.promises.unlink(temporaryPath).catch(() => undefined);
    }
  }

  backupPath(id) {
    const safeName = path.basename(String(id || ''));
    if (!safeName || safeName !== id || !safeName.endsWith('.json')) throw new Error('Invalid backup ID.');
    return path.join(this.backupsPath, safeName);
  }

  async createDatabaseBackup(data, label = '') {
    await this.init();
    data = await expandKnowledgeBodies(data, this);
    data = await expandKnowledgeVersions(data, this);
    const createdAt = new Date().toISOString();
    const id = `${createdAt.replace(/[:.]/g, '-')}-${crypto.randomUUID()}.json`;
    await fs.promises.writeFile(this.backupPath(id), JSON.stringify({ createdAt, label: String(label || ''), data }, null, 2), 'utf8');
    return { id, createdAt, label: String(label || ''), size: Buffer.byteLength(JSON.stringify(data)) };
  }

  async listDatabaseBackups() {
    await this.init();
    const entries = await fs.promises.readdir(this.backupsPath, { withFileTypes: true });
    const backups = [];
    for (const entry of entries.filter(item => item.isFile() && item.name.endsWith('.json'))) {
      try {
        const raw = await fs.promises.readFile(this.backupPath(entry.name), 'utf8');
        const stored = JSON.parse(raw);
        backups.push({ id: entry.name, createdAt: stored.createdAt, label: stored.label || '', size: Buffer.byteLength(raw) });
      } catch {
        /* Ignore incomplete or manually edited backup files. */
      }
    }
    return backups.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  async loadDatabaseBackup(id) {
    const stored = JSON.parse(await fs.promises.readFile(this.backupPath(id), 'utf8'));
    if (!stored?.data || typeof stored.data !== 'object') throw new Error('Backup data is invalid.');
    return stored.data;
  }

  async deleteDatabaseBackup(id) {
    await this.init();
    await fs.promises.unlink(this.backupPath(id));
  }

  filePath(filename) {
    const safeName = path.basename(filename);
    if (!safeName || safeName !== filename) throw new Error('Invalid storage filename.');
    return path.join(this.uploadsPath, safeName);
  }

  async uploadFile(filename, source, mimeType = 'application/octet-stream', options = {}) {
    await this.init();
    const targetPath = this.filePath(filename);
    if (Buffer.isBuffer(source)) await fs.promises.writeFile(targetPath, source, { signal: options.signal });
    else if (source?.path) await fs.promises.copyFile(source.path, targetPath);
    else throw new TypeError('Upload source must be a Buffer or a file path.');
    const stat = await fs.promises.stat(targetPath);
    return { fileId: filename, filename, size: stat.size, mimeType };
  }

  async fileExists(filename) {
    try {
      await fs.promises.access(this.filePath(filename), fs.constants.R_OK);
      return true;
    } catch (error) {
      if (error?.code === 'ENOENT') return false;
      throw error;
    }
  }

  async copyMediaObject(file, filename, { fromBackup = false, toBackup = true, sourceStorage = this } = {}) {
    await this.init();
    const directory = path.join(this.backupsPath, 'media');
    await fs.promises.mkdir(directory, { recursive: true });
    const safe = name => {
      if (path.basename(name) !== name) throw Error('Invalid media name.');
      return path.join(directory, name);
    };
    if (path.basename(file.storageName) !== file.storageName) throw Error('Invalid media name.');
    const source = fromBackup ? path.join(sourceStorage.backupsPath, 'media', file.storageName) : sourceStorage.filePath(file.storageName);
    const target = toBackup ? safe(filename) : this.filePath(filename);
    const hash = async name => {
      const digest = crypto.createHash('md5');
      for await (const chunk of fs.createReadStream(name)) digest.update(chunk);
      return digest.digest('hex');
    };
    const before = await hash(source);
    if ((await fs.promises.stat(source)).size !== file.bytes || (file.checksum && file.checksum !== before))
      throw Object.assign(Error('Media source changed.'), { code: 'MEDIA_SOURCE_CHANGED', statusCode: 409 });
    try {
      await fs.promises.copyFile(source, target, fs.constants.COPYFILE_EXCL);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    if ((await hash(source)) !== before || (await hash(target)) !== before || (await fs.promises.stat(target)).size !== file.bytes)
      throw Error('Media copy integrity check failed.');
    return { storageFileId: filename, storageName: filename, bytes: file.bytes, checksum: before };
  }

  async saveMediaManifest(job) {
    const directory = path.join(this.backupsPath, 'media');
    await fs.promises.mkdir(directory, { recursive: true });
    if (!/^[a-f0-9-]{36}$/i.test(job.id)) throw Error('Invalid media backup.');
    await fs.promises.writeFile(path.join(directory, `media-manifest-${job.id}.json`), JSON.stringify({ format: 'smena-media-v1', ...job }), 'utf8');
  }

  async readMediaManifest(id) {
    if (!/^[a-f0-9-]{36}$/i.test(id || '')) throw new TypeError('Invalid media manifest.');
    const file = path.join(this.backupsPath, 'media', `media-manifest-${id}.json`);
    if ((await fs.promises.stat(file)).size > 2 * 1024 * 1024) throw new TypeError('Media manifest is too large.');
    return JSON.parse(await fs.promises.readFile(file, 'utf8'));
  }

  async verifyMediaBackupObject(file) {
    if (typeof file.storageName !== 'string' || path.basename(file.storageName) !== file.storageName) throw Error('Invalid media name.');
    const source = path.join(this.backupsPath, 'media', file.storageName);
    if ((await fs.promises.stat(source)).size !== file.bytes) throw Error('Media size changed.');
    const hash = crypto.createHash('md5');
    for await (const chunk of fs.createReadStream(source)) hash.update(chunk);
    if (hash.digest('hex') !== file.checksum) throw Error('Media checksum changed.');
  }

  async removeMediaBackupPart(job, index) {
    const part = mediaBackupPart(job, index);
    if (!part) return;
    const directory = path.resolve(this.backupsPath, 'media');
    const filename = path.resolve(directory, part.name);
    if (path.dirname(filename) !== directory) throw new TypeError('Invalid backup path.');
    try {
      const stat = await fs.promises.stat(filename);
      if (!stat.isFile()) throw Error('Invalid backup object.');
      if (!part.manifest) {
        const digest = crypto.createHash('md5');
        for await (const chunk of fs.createReadStream(filename)) digest.update(chunk);
        if (stat.size !== part.bytes || digest.digest('hex') !== part.checksum)
          throw Object.assign(Error('Backup identity changed.'), { code: 'MEDIA_SOURCE_CHANGED', statusCode: 409 });
      }
      await fs.promises.unlink(filename);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  async openDownloadStream(filename, _fileId, range) {
    const targetPath = this.filePath(filename);
    let stat;
    try {
      stat = await fs.promises.stat(targetPath);
    } catch (error) {
      if (error?.code === 'ENOENT') return null;
      throw error;
    }
    const start = Math.max(0, Number(range?.start || 0));
    const end = Math.min(stat.size - 1, Number(range?.end ?? stat.size - 1));
    if (!stat.size || start > end || start >= stat.size) return null;
    return {
      stream: fs.createReadStream(targetPath, { start, end }),
      mimeType: 'application/octet-stream',
      size: stat.size,
      start,
      end,
    };
  }

  async getUploadMetadata(filename) {
    try {
      const stat = await fs.promises.stat(this.filePath(filename));
      return { id: filename, name: filename, size: stat.size, version: `${stat.mtimeMs}:${stat.ctimeMs}` };
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }

  async downloadFile(filename, fileId) {
    const result = await this.openDownloadStream(filename, fileId);
    if (!result) return null;
    const chunks = [];
    for await (const chunk of result.stream) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);
    return { buffer, mimeType: result.mimeType, size: buffer.length };
  }

  async deleteFile(filename) {
    try {
      await fs.promises.unlink(this.filePath(filename));
      return true;
    } catch (error) {
      if (error?.code === 'ENOENT') return false;
      throw error;
    }
  }

  async getStatus() {
    return {
      provider: this.name,
      connected: true,
      persistent: !process.env.VERCEL,
      uploadsReady: true,
      uploadsPath: this.uploadsPath,
    };
  }
}
