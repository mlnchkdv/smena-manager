import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

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

  constructor(databasePath = process.env.DATABASE_PATH || path.join(process.cwd(), '.data', 'smena-manager-data.json')) {
    this.databasePath = path.resolve(databasePath);
    this.pushSubscriptionsPath = path.resolve(path.join(path.dirname(this.databasePath), 'push-subscriptions.json'));
    this.notificationDeliveryPath = path.resolve(path.join(path.dirname(this.databasePath), 'notification-delivery-status.json'));
    this.authSessionsPath = path.resolve(path.join(path.dirname(this.databasePath), 'auth-sessions.json'));
    this.uploadsPath = path.resolve(process.env.UPLOADS_PATH || path.join(path.dirname(this.databasePath), 'uploads'));
    this.backupsPath = path.resolve(process.env.BACKUPS_PATH || path.join(path.dirname(this.databasePath), 'backups'));
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
    try {
      const value = await fs.promises.readFile(this.databasePath, 'utf8');
      return JSON.parse(value);
    } catch (error) {
      if (error?.code === 'ENOENT') return null;
      throw error;
    }
  }

  async saveDatabase(data) {
    await this.init();
    const temporaryPath = `${this.databasePath}.${process.pid}.${Date.now()}.tmp`;
    try {
      await fs.promises.writeFile(temporaryPath, JSON.stringify(data, null, 2), 'utf8');
      await renameWithRetry(temporaryPath, this.databasePath);
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
    return backups.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 50);
  }

  async loadDatabaseBackup(id) {
    const stored = JSON.parse(await fs.promises.readFile(this.backupPath(id), 'utf8'));
    if (!stored?.data || typeof stored.data !== 'object') throw new Error('Backup data is invalid.');
    return stored.data;
  }

  filePath(filename) {
    const safeName = path.basename(filename);
    if (!safeName || safeName !== filename) throw new Error('Invalid storage filename.');
    return path.join(this.uploadsPath, safeName);
  }

  async uploadFile(filename, source, mimeType = 'application/octet-stream') {
    await this.init();
    const targetPath = this.filePath(filename);
    if (Buffer.isBuffer(source)) await fs.promises.writeFile(targetPath, source);
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
