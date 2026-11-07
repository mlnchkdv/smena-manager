import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { requestSignal } from '../../src/server/request-signal.js';
import { GoogleDriveStorageProvider } from '../../src/server/storage/google-drive.js';
test('client disconnection aborts reads; completed responses clean listeners without canceling later work', () => {
  const req = new EventEmitter(),
    res = new EventEmitter();
  const signal = requestSignal(req, res);
  res.emit('close');
  assert.equal(signal.aborted, true);
  assert.equal(signal.reason.name, 'AbortError');
  assert.equal(req.listenerCount('aborted'), 0);
  const req2 = new EventEmitter(),
    res2 = new EventEmitter();
  const done = requestSignal(req2, res2);
  res2.writableEnded = true;
  res2.emit('finish');
  res2.emit('close');
  assert.equal(done.aborted, false);
  assert.equal(req2.listenerCount('aborted'), 0);
});
test('Drive search, metadata and file-part reads forward abort signals and stop before new RPCs', async () => {
  const provider = new GoogleDriveStorageProvider();
  provider.init = async () => {};
  provider.rootFolderId = 'own';
  let calls = 0;
  const controller = new AbortController(),
    signal = controller.signal;
  provider.client = {
    files: {
      list: async (args, options) => {
        calls++;
        assert.equal(options.signal, signal);
        assert.ok(args.q.includes("'own' in parents"));
        return { data: { files: [{ id: 'object', size: '10' }] } };
      },
      get: async (args, options) => {
        calls++;
        assert.equal(options.signal, signal);
        return { data: 'bytes' };
      },
    },
  };
  await provider.readKnowledgeSearch('a'.repeat(64), { signal });
  await provider.readKnowledgeMetadata('b'.repeat(64), { signal });
  await provider.readCatalogPart('file-part', undefined, signal);
  assert.equal(calls, 5);
  controller.abort();
  await assert.rejects(provider.readKnowledgeSearch('a'.repeat(64), { signal }), { name: 'AbortError' });
  await assert.rejects(provider.readCatalogPart('file-part', undefined, signal), { name: 'AbortError' });
  assert.equal(calls, 5);
});
