import fs from 'node:fs';
import path from 'node:path';

export class LocalStorageProvider {
  name = 'local';

  constructor(databasePath = process.env.DATABASE_PATH || path.join(process.cwd(), '.data', 'smena-manager-data.json')) {
    this.databasePath = path.resolve(databasePath);
  }

  async init() {
    await fs.promises.mkdir(path.dirname(this.databasePath), { recursive: true });
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
      await fs.promises.rename(temporaryPath, this.databasePath);
    } finally {
      await fs.promises.unlink(temporaryPath).catch(() => undefined);
    }
  }

  async getStatus() {
    return {
      provider: this.name,
      connected: true,
      persistent: !process.env.VERCEL,
    };
  }
}
