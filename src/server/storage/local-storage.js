import fs from 'node:fs';
import path from 'node:path';

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
    this.uploadsPath = path.resolve(process.env.UPLOADS_PATH || path.join(path.dirname(this.databasePath), 'uploads'));
  }

  async init() {
    await fs.promises.mkdir(path.dirname(this.databasePath), { recursive: true });
    await fs.promises.mkdir(this.uploadsPath, { recursive: true });
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
