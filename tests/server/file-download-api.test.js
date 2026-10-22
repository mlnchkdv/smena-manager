import test from 'node:test';
import assert from 'node:assert/strict';
import { setSessionToken, clearSession, downloadWorkspaceFile } from '../../src/core/api.js';
test('bounded file downloads reject zero remaining bytes, oversized headers and streams and report progress', async t => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
    clearSession();
  });
  setSessionToken('cookie');
  globalThis.fetch = async () => new Response('x');
  await assert.rejects(downloadWorkspaceFile('f', true, { maxBytes: 0 }), { code: 'PREVIEW_TOO_LARGE' });
  globalThis.fetch = async () => new Response('x', { headers: { 'Content-Length': '100' } });
  await assert.rejects(downloadWorkspaceFile('f', true, { maxBytes: 10 }), { code: 'PREVIEW_TOO_LARGE' });
  globalThis.fetch = async () => new Response('12345');
  await assert.rejects(downloadWorkspaceFile('f', true, { maxBytes: 4 }), { code: 'PREVIEW_TOO_LARGE' });
  const progress = [];
  const result = await downloadWorkspaceFile('f', true, { maxBytes: 5, onProgress: value => progress.push(value) });
  assert.equal(await result.blob.text(), '12345');
  assert.equal(progress.at(-1), 5);
});
