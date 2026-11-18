import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

test('offline archive serves only the exact local record with scriptless CSP and no network request', async () => {
  const listeners = new Map();
  let stored = { key: 'owner/workspace/version', kind: 'bookmark-archive', document: '<!doctype html><p>Saved page</p>' };
  const indexedDB = {
    open() {
      const request = {};
      request.result = {
        close() {},
        transaction: () => ({
          objectStore: () => ({
            get: key => {
              const record = {};
              queueMicrotask(() => {
                record.result = stored?.key === key ? stored : undefined;
                record.onsuccess();
              });
              return record;
            },
          }),
        }),
      };
      queueMicrotask(() => request.onsuccess());
      return request;
    },
  };
  vm.runInNewContext(await fs.readFile(new URL('../../public/sw.js', import.meta.url), 'utf8'), {
    self: { location: { origin: 'https://smena.test' }, addEventListener: (name, fn) => listeners.set(name, fn) },
    URL,
    Response,
    indexedDB,
    fetch() {
      throw new Error('Offline archives must not use the network');
    },
  });
  const request = key =>
    new Promise(resolve =>
      listeners.get('fetch')({
        request: { method: 'GET', url: 'https://smena.test/offline-archive?key=' + encodeURIComponent(key) },
        respondWith: result => resolve(result),
      }),
    );
  const response = await request(stored.key);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-security-policy'), /sandbox; default-src 'none'; script-src 'none'/);
  assert.equal(await response.text(), stored.document);
  assert.equal((await request('different-owner/workspace/version')).status, 404);
  stored = null;
  assert.equal((await request('owner/workspace/version')).status, 404, 'cleared library cannot be read after sign-out');
});
