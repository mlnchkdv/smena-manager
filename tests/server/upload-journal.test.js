import test from 'node:test';
import assert from 'node:assert/strict';
import { createUploadJournal, createUploadOwner, fullUploadFingerprint, readUploadFallback } from '../../src/shared/upload-journal.js';

function storage() {
  const rows = new Map();
  return {
    rows,
    get: async key => structuredClone(rows.get(key)),
    put: async (key, value) => rows.set(key, structuredClone(value)),
    clear: async () => rows.clear(),
  };
}

test('blocked or corrupt session fallback does not prevent recovery from the durable journal', async () => {
  const db = storage(),
    journal = createUploadJournal({ storage: db });
  await journal.save('scope', [{ id: 'durable' }]);
  for (const read of [
    () => {
      throw Error('Storage disabled');
    },
    () => '{invalid',
    () => '{}',
  ]) {
    assert.deepEqual(readUploadFallback(read), []);
    assert.deepEqual(await journal.read('scope'), [{ id: 'durable' }]);
  }
  assert.deepEqual(
    readUploadFallback(() => '[{"id":"session"}]'),
    [{ id: 'session' }],
  );
});

test('file handles survive with encrypted checkpoints, remain scoped and clear on signout', async () => {
  const db = storage(),
    journal = createUploadJournal({ storage: db });
  const entries = [{ id: 'source', sourceHandle: { kind: 'file', name: 'large.mp4' }, session: { ticket: 'private' } }];
  await journal.save('one', entries);
  assert.deepEqual(await createUploadJournal({ storage: db }).read('one'), entries);
  assert.equal(new TextDecoder().decode(db.rows.get('queue:one').payload).includes('private'), false);
  assert.deepEqual(await journal.read('two'), []);
  const put = db.put;
  db.put = async (key, value) => {
    if (value.sources?.length) throw Object.assign(Error('no handles'), { name: 'DataCloneError' });
    return put(key, value);
  };
  await journal.save('unsupported', entries);
  assert.deepEqual(await journal.read('unsupported'), [{ id: 'source', session: { ticket: 'private' } }]);
  await journal.clear();
  assert.equal(db.rows.size, 0);
});
test('journal survives a new instance, encrypts provider tickets, authenticates scope and clears on signout', async () => {
  const db = storage(),
    first = createUploadJournal({ storage: db });
  const scope = JSON.stringify(['account', 'workspace']);
  const checkpoint = [
    {
      id: 'f',
      accepted: 8388608,
      session: { ticket: 'sensitive-provider-ticket', uploadUrl: 'https://www.googleapis.com/upload/drive/v3/files?upload_id=secret' },
    },
  ];
  await first.save(scope, checkpoint);
  assert.equal(db.rows.get(`key:${scope}`).extractable, false);
  const stored = db.rows.get(`queue:${scope}`);
  assert.equal(new TextDecoder().decode(stored.payload).includes('sensitive-provider-ticket'), false);
  assert.deepEqual(await createUploadJournal({ storage: db }).read(scope), checkpoint);
  assert.deepEqual(await first.read('different-account'), []);
  db.rows.set('key:forged-scope', db.rows.get(`key:${scope}`));
  db.rows.set('queue:forged-scope', stored);
  await assert.rejects(first.read('forged-scope'));
  await first.clear();
  assert.equal(db.rows.size, 0);
  assert.deepEqual(await first.read(scope), []);
});

test('queued/in-flight checkpoint saves cannot resurrect credentials after clear or a scope change', async () => {
  const db = storage();
  let release, started;
  const paused = new Promise(resolve => {
    started = resolve;
  });
  const gate = new Promise(resolve => {
    release = resolve;
  });
  const underlying = db.get;
  db.get = async key => {
    started();
    await gate;
    return underlying(key);
  };
  const journal = createUploadJournal({ storage: db });
  const save = journal.save('scope', [{ id: 'f' }]);
  await paused;
  const clear = journal.clear();
  release();
  await Promise.all([save, clear]);
  assert.equal(db.rows.size, 0);
  await journal.save('old-scope', [{ id: 'f' }], () => false);
  assert.equal(db.rows.size, 0);
});

test('exclusive queue ownership rejects a second tab and releases when its owner closes', async () => {
  const held = new Set();
  const locks = {
    request: async (name, options, callback) => {
      assert.equal(options.ifAvailable, true);
      if (held.has(name)) return callback(null);
      held.add(name);
      try {
        return await callback({ name });
      } finally {
        held.delete(name);
      }
    },
  };
  const a = createUploadOwner({ locks, scope: 'account-workspace' }),
    b = createUploadOwner({ locks, scope: 'account-workspace' });
  assert.equal(await a.acquire(), true);
  assert.equal(await a.acquire(), true);
  assert.equal(await b.acquire(), false);
  const other = createUploadOwner({ locks, scope: 'other-workspace' });
  assert.equal(await other.acquire(), true);
  a.close();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(await b.acquire(), true);
  b.close();
  other.close();
  assert.equal(await createUploadOwner({ scope: 'unsupported' }).acquire(), false);
});

test('chunked source identity detects changes in the unsampled middle with bounded reads and cancellation', async () => {
  const bytes = new Uint8Array(17 * 1024 * 1024),
    changed = bytes.slice();
  changed[9 * 1024 * 1024] = 1;
  assert.notEqual(await fullUploadFingerprint(new Blob([bytes])), await fullUploadFingerprint(new Blob([changed])));
  let maximum = 0,
    read = 0;
  const file = {
    size: bytes.length,
    slice: (start, end) => {
      const count = Math.min(end, bytes.length) - start;
      maximum = Math.max(maximum, count);
      read += count;
      return new Blob([bytes.slice(start, end)]);
    },
  };
  await fullUploadFingerprint(file);
  assert.equal(read, bytes.length);
  assert.equal(maximum, 8 * 1024 * 1024);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(fullUploadFingerprint(file, controller.signal), { code: 'UPLOAD_CANCELLED' });
});
