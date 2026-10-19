import assert from 'node:assert/strict';
import test from 'node:test';
import { getCurrentUser, getSessionToken, setSessionToken, getAuthConfig, savePersonalSettings } from '../../src/core/api.js';

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
