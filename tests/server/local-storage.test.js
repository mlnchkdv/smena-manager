import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { LocalStorageProvider } from '../../src/server/storage/local-storage.js';

test('local storage saves and restores the workspace database atomically', async t => {
  const testRoot = path.join(process.cwd(), '.data', 'tests');
  await fs.promises.mkdir(testRoot, { recursive: true });
  const directory = await fs.promises.mkdtemp(path.join(testRoot, 'local-storage-'));
  t.after(() => fs.promises.rm(directory, { recursive: true, force: true }));

  const provider = new LocalStorageProvider(path.join(directory, 'workspace.json'));
  await provider.init();
  assert.equal(await provider.loadDatabase(), null);

  const database = { schemaVersion: 1, revision: 2, tasks: [{ id: 'task-1' }] };
  await provider.saveDatabase(database);

  assert.deepEqual(await provider.loadDatabase(), database);
  assert.equal((await provider.getStatus()).provider, 'local');
});
