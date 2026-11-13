import test from 'node:test';
import assert from 'node:assert/strict';
import { uploadDirectFile } from '../../src/core/direct-upload-session.js';

test('lost catalog response survives a reload without reading or re-uploading the source', async () => {
  let checkpoint,
    completeCalls = 0,
    bytesSent = 0;
  const file = { name: 'large.mp4', size: 5 * 1024 ** 3 };
  const deps = {
    assertScope: () => {},
    transfer: async () => {
      bytesSent++;
      return { id: 'same-provider-file' };
    },
    request: async (url, options) => {
      if (url.endsWith('upload-session')) return { uploadUrl: 'provider-session', ticket: 'original' };
      if (url.endsWith('upload-check')) return { ok: true, ticket: 'renewed' };
      assert.equal(JSON.parse(options.body).fileId, 'same-provider-file');
      if (++completeCalls === 1) throw Object.assign(Error('lost response'), { code: 'NETWORK_ERROR' });
      return { file: { id: 'single-catalog-entry' } };
    },
  };
  const metadata = {
    onCheckpoint: session => {
      checkpoint = structuredClone(session);
    },
  };
  await assert.rejects(uploadDirectFile(file, metadata, null, deps), { code: 'NETWORK_ERROR' });
  assert.equal(checkpoint.uploaded.id, 'same-provider-file');
  const result = await uploadDirectFile(file, { ...metadata, checkpoint }, null, deps);
  assert.equal(result.file.id, 'single-catalog-entry');
  assert.equal(bytesSent, 1);
  assert.equal(completeCalls, 2);
});

test('restored session rechecks rights before any provider bytes; denied rights never transfer', async () => {
  let transfers = 0;
  await assert.rejects(
    uploadDirectFile({ size: 10 }, { checkpoint: { ticket: 'saved', uploadUrl: 'saved-url' } }, null, {
      assertScope: () => {},
      request: async () => {
        throw Object.assign(Error('denied'), { status: 403 });
      },
      transfer: async () => {
        transfers++;
      },
    }),
    { status: 403 },
  );
  assert.equal(transfers, 0);
});
