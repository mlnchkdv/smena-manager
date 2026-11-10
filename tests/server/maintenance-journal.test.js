import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { localMaintenanceJournal, driveMaintenanceJournal } from '../../src/server/storage/maintenance-journal.js';

test('Local inspection progress survives a new provider and rejects stale/concurrent checkpoints', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'smena-inspection-'));
  try {
    const storage = { databasePath: path.join(directory, 'workspace.json') };
    const a = localMaintenanceJournal(storage),
      b = localMaintenanceJournal(storage);
    assert.deepEqual(await a.read(), { payload: null, token: null });
    const saved = await a.save({ id: 'first', phase: 'inventory', cursor: { page: 1 } }, null);
    assert.deepEqual((await b.read()).payload, saved.payload);
    const results = await Promise.allSettled([a.save({ id: 'first', phase: 'paused' }, saved.token), b.save({ id: 'first', phase: 'running' }, saved.token)]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(results.find(r => r.status === 'rejected').reason.code, 'INSPECTION_CONFLICT');
    assert.equal((await localMaintenanceJournal(storage).read()).payload.id, 'first');
    await assert.rejects(a.save({ huge: 'x'.repeat(8 * 1024 * 1024) }, null), { code: 'INSPECTION_CAPACITY' });
    assert.deepEqual(
      (await fs.readdir(directory)).filter(n => n.endsWith('.tmp')),
      [],
    );
    assert.equal((await fs.readdir(directory)).includes('workspace.json'), false);
  } finally {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    await fs.rm(directory, { recursive: true, force: true });
  }
});

function fakeDrive() {
  let text = '',
    etag = 'v1';
  const file = {
    id: 'inspection',
    name: 'smena-storage-inspection.json',
    mimeType: 'application/json',
    parents: ['workspace-a'],
    appProperties: { smenaStorageInspection: '1' },
    size: 0,
  };
  const state = { duplicate: false, writes: 0, mismatch: false };
  const storage = {
    rootFolderId: 'workspace-a',
    client: {
      files: {
        list: async () => ({ data: { files: text ? [file, ...(state.duplicate ? [file] : [])] : [] } }),
        get: async () => ({ data: Readable.from([text]) }),
        create: async ({ media, requestBody }) => {
          assert.deepEqual(requestBody.parents, ['workspace-a']);
          text = '';
          for await (const chunk of media.body) text += chunk;
          file.size = Buffer.byteLength(text);
          state.writes++;
          return { data: { id: file.id } };
        },
      },
    },
    versionClient: { files: { get: async () => ({ data: { etag, md5Checksum: state.mismatch ? 'invalid' : createHash('md5').update(text).digest('hex') } }) } },
    updateVersionedJson: async (_params, options) => {
      if (options.headers['If-Match'] !== etag) throw Object.assign(new Error(), { code: 412 });
      let next = '';
      for await (const chunk of _params.media.body) next += chunk;
      text = next;
      file.size = Buffer.byteLength(text);
      etag = 'v' + (Number(etag.slice(1)) + 1);
      state.writes++;
    },
  };
  return { storage, state, file };
}

test('Drive journal binds bytes to ETag, retains workspace identity and fails closed on ambiguity', async () => {
  const { storage, state, file } = fakeDrive(),
    journal = driveMaintenanceJournal(storage);
  await journal.save({ id: 'job', phase: 'inventory' }, null);
  const first = await journal.read();
  await journal.save({ id: 'job', phase: 'paused' }, first.token);
  await assert.rejects(journal.save({ phase: 'wrong' }, first.token), { code: 'INSPECTION_CONFLICT' });
  assert.equal((await driveMaintenanceJournal(storage).read()).payload.phase, 'paused');
  assert.equal(state.writes, 2);
  state.mismatch = true;
  await assert.rejects(journal.read(), { code: 'INSPECTION_CONFLICT' });
  state.mismatch = false;
  state.duplicate = true;
  await assert.rejects(journal.read(), { code: 'INSPECTION_AMBIGUOUS' });
  state.duplicate = false;
  file.parents = ['another-workspace'];
  await assert.rejects(journal.read(), { code: 'STORAGE_INSPECTION_INTEGRITY' });
  assert.equal(state.writes, 2);
});
