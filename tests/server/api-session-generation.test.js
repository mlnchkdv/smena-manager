import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getCurrentUser,
  getSessionToken,
  setSessionToken,
  getAuthConfig,
  savePersonalSettings,
  putWorkspace,
  loadFileIdentities,
  uploadWorkspaceFile,
} from '../../src/core/api.js';

test('multipart uploads resolve only the uploaded identity instead of hydrating the whole catalog', async () => {
  const originalFetch = globalThis.fetch,
    originalXHR = globalThis.XMLHttpRequest;
  const uploaded = { id: 'new-file', project: 'p', name: 'Тест.txt' };
  globalThis.XMLHttpRequest = class {
    upload = {};
    headers = new Map();
    open(method, url) {
      assert.equal(method, 'POST');
      assert.equal(url, '/api/files/upload');
    }
    setRequestHeader(key, value) {
      this.headers.set(key, value);
    }
    send() {
      assert.equal(this.headers.get('X-Smena-File-Catalog'), 'demand');
      this.status = 200;
      this.response = { file: uploaded, data: { revision: 10 }, fileCatalog: { mode: 'demand', total: 10000 } };
      void this.onload();
    }
  };
  let requests = 0;
  globalThis.fetch = async (path, options) => {
    requests++;
    assert.equal(path, '/api/files/catalog/resolve');
    assert.deepEqual(JSON.parse(options.body).ids, [uploaded.id]);
    return new Response(JSON.stringify({ revision: 10, files: [uploaded], nextOffset: null }));
  };
  try {
    setSessionToken('upload-owner');
    const result = await uploadWorkspaceFile(new File(['text'], 'Тест.txt'), { revision: 9, project: 'p' });
    assert.deepEqual(result.data.files, [uploaded]);
    assert.equal(requests, 1);
  } finally {
    setSessionToken('');
    globalThis.fetch = originalFetch;
    globalThis.XMLHttpRequest = originalXHR;
  }
});

test('lazy catalog imports cannot send an old workspace through a new account', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => assert.fail('No request may be sent after the account changes during an import');
  try {
    for (const operation of [() => putWorkspace({ files: [], projects: [], tasks: [] }, 1), () => loadFileIdentities(['old-private-id'])]) {
      setSessionToken('old');
      const pending = operation();
      setSessionToken('new');
      await assert.rejects(pending, { code: 'SESSION_CHANGED', staleSession: true });
    }
  } finally {
    setSessionToken('');
    globalThis.fetch = originalFetch;
  }
});

test('a cookie switched by another tab cannot write through the previous account context or sign out the new account', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  setSessionToken('cookie');
  globalThis.fetch = async (_url, options) => {
    calls += 1;
    if (calls === 1) return new Response(JSON.stringify({ user: { id: 'Алиса' } }), { headers: { 'Content-Type': 'application/json' } });
    assert.equal(options.headers.get('X-Smena-Account'), encodeURIComponent('Алиса'));
    return new Response(JSON.stringify({ error: 'Changed account', code: 'SESSION_ACCOUNT_CHANGED' }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  try {
    await getCurrentUser();
    await assert.rejects(savePersonalSettings({ preferences: { theme: 'dark' } }), { staleSession: true, code: 'SESSION_ACCOUNT_CHANGED' });
    assert.equal(getSessionToken(), 'cookie');
    await assert.rejects(getCurrentUser(), { staleSession: true });
    assert.equal(calls, 2);
  } finally {
    setSessionToken('');
    globalThis.fetch = originalFetch;
  }
});

test('a valid HttpOnly cookie can restore the account when local storage has no marker', async () => {
  const originalFetch = globalThis.fetch;
  setSessionToken('');
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.credentials, 'include');
    return new Response(JSON.stringify({ user: { id: 'cookie-owner' } }), { headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const user = await getCurrentUser({ allowCookieOnly: true });
    assert.equal(user.id, 'cookie-owner');
  } finally {
    setSessionToken('');
    globalThis.fetch = originalFetch;
  }
});

test('platform errors produce readable text instead of object placeholders', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: { code: 'FUNCTION_INVOCATION_FAILED', message: 'Platform failure' } }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  try {
    await assert.rejects(getAuthConfig(), { message: 'The server is unavailable.', code: 'FUNCTION_INVOCATION_FAILED', status: 500 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('late authenticated responses cannot clear or update a newly signed-in session', async () => {
  const originalFetch = globalThis.fetch;
  let release;
  globalThis.fetch = () =>
    new Promise(resolve => {
      release = resolve;
    });
  try {
    for (const status of [200, 401]) {
      setSessionToken('old');
      const pending = getCurrentUser();
      setSessionToken('new');
      release(
        new Response(JSON.stringify(status === 200 ? { user: { id: 'old-owner' } } : { error: 'Expired' }), {
          status,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      await assert.rejects(pending, { code: 'SESSION_CHANGED', staleSession: true });
      assert.equal(getSessionToken(), 'new');
    }
  } finally {
    setSessionToken('');
    globalThis.fetch = originalFetch;
  }
});
