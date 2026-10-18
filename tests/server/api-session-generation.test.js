import assert from 'node:assert/strict';
import test from 'node:test';
import { getCurrentUser, getSessionToken, setSessionToken } from '../../src/core/api.js';

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
