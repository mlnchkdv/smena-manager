import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';

export class OperationJournal {
  constructor({ profile = 'default', directory = path.join(os.homedir(), '.smena-mcp') } = {}) {
    if (!/^[A-Za-z0-9_.-]{1,80}$/.test(profile)) throw new Error('Invalid operation profile.');
    this.directory = directory;
    this.filename = path.join(directory, 'operations-' + profile + '.json');
    this.queue = Promise.resolve();
  }
  async read() {
    try {
      const text = await fs.readFile(this.filename, 'utf8');
      if (Buffer.byteLength(text) > 1024 * 1024) throw new Error('Operation journal limit exceeded.');
      const data = JSON.parse(text);
      if (data.schemaVersion !== 1 || !Array.isArray(data.operations)) throw new Error('Operation journal is invalid.');
      return data;
    } catch (error) {
      if (error.code === 'ENOENT') return { schemaVersion: 1, operations: [] };
      throw error;
    }
  }
  mutate(change) {
    const run = async () => {
      await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
      const data = await this.read(),
        result = change(data),
        temporary = this.filename + '.' + randomUUID() + '.tmp';
      try {
        await fs.writeFile(temporary, JSON.stringify(data), { mode: 0o600 });
        await fs.rename(temporary, this.filename);
      } finally {
        await fs.unlink(temporary).catch(() => {});
      }
      return result;
    };
    const pending = this.queue.then(run, run);
    this.queue = pending.catch(() => {});
    return pending;
  }
  reserve(operationId, origin, method, apiPath, body, etag) {
    const digest = createHash('sha256')
      .update(JSON.stringify([origin, method, apiPath, body, etag || null]))
      .digest('hex');
    return this.mutate(data => {
      const before = data.operations.find(row => row.id === operationId);
      if (before && before.digest !== digest)
        throw Object.assign(new Error('This operation ID belongs to another request. Use a new ID for a new intended change.'), {
          code: 'OPERATION_ID_REUSED',
        });
      if (before && !apiPath.includes('/research/') && Date.now() - before.createdAt >= 24 * 60 * 60 * 1000)
        throw Object.assign(new Error('The retry window expired. Inspect the note and operation state before creating another request.'), {
          code: 'OPERATION_EXPIRED',
        });
      if (before) return before;
      data.operations = data.operations.filter(row => row.state !== 'completed' || Date.now() - row.createdAt < 24 * 60 * 60 * 1000);
      if (data.operations.length >= 500)
        throw Object.assign(new Error('Operation journal is full. Resolve uncertain operations before starting more.'), { code: 'OPERATION_JOURNAL_FULL' });
      const row = { id: operationId, digest, method, path: apiPath, origin, createdAt: Date.now(), state: 'pending' };
      data.operations.push(row);
      return row;
    });
  }
  mark(id, state, result) {
    return this.mutate(data => {
      const row = data.operations.find(row => row.id === id);
      if (!row) return;
      row.state = state;
      if (result)
        row.result = Object.fromEntries(
          ['id', 'workspace_id', 'version', 'etag', 'url', 'content_sha256', 'upload_id', 'state']
            .filter(key => result[key] !== undefined)
            .map(key => [key, result[key]]),
        );
    });
  }
  async recent() {
    return { items: (await this.read()).operations.slice(-20).reverse() };
  }
}
