import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { LocalStorageProvider } from '../../src/server/storage/local-storage.js';

test('local storage retries transient Windows rename errors', async t => {
  if (process.platform !== 'win32') {
    t.skip('Windows-specific filesystem behavior');
    return;
  }
  const directory = path.join(process.cwd(), '.data', 'tests', `local-storage-retry-${process.pid}`);
  const databasePath = path.join(directory, 'workspace.json');
  await fs.promises.rm(directory, { recursive: true, force: true });
  const provider = new LocalStorageProvider(databasePath);
  const originalRename = fs.promises.rename;
  let attempts = 0;
  fs.promises.rename = async (...args) => {
    attempts += 1;
    if (attempts === 1) throw Object.assign(new Error('temporarily locked'), { code: 'EPERM' });
    return originalRename(...args);
  };
  t.after(async () => {
    fs.promises.rename = originalRename;
    await fs.promises.rm(directory, { recursive: true, force: true });
  });

  await provider.saveDatabase({ revision: 1 });

  assert.equal(attempts, 2);
  assert.deepEqual(await provider.loadDatabase(), { revision: 1 });
});

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

test('local storage uploads, streams byte ranges, and deletes files', async t => {
  const testRoot = path.join(process.cwd(), '.data', 'tests');
  await fs.promises.mkdir(testRoot, { recursive: true });
  const directory = await fs.promises.mkdtemp(path.join(testRoot, 'local-files-'));
  t.after(() => fs.promises.rm(directory, { recursive: true, force: true }));

  const provider = new LocalStorageProvider(path.join(directory, 'workspace.json'));
  const uploaded = await provider.uploadFile('asset.txt', Buffer.from('0123456789'), 'text/plain');
  assert.equal(uploaded.size, 10);
  assert.equal(await provider.fileExists('asset.txt'), true);

  const ranged = await provider.openDownloadStream('asset.txt', uploaded.fileId, { start: 2, end: 5 });
  const chunks = [];
  for await (const chunk of ranged.stream) chunks.push(chunk);
  assert.equal(Buffer.concat(chunks).toString('utf8'), '2345');
  assert.deepEqual({ start: ranged.start, end: ranged.end, size: ranged.size }, { start: 2, end: 5, size: 10 });

  assert.equal(await provider.deleteFile('asset.txt', uploaded.fileId), true);
  assert.equal(await provider.fileExists('asset.txt'), false);
  await assert.rejects(() => provider.uploadFile('../escape.txt', Buffer.from('blocked')), /Invalid storage filename/);
});
