import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startBrowserLogin } from '../../packages/smena-mcp/src/browser-login.js';

test('local setup rejects cross-origin/rebound requests and saves once without echoing the token', async () => {
  const saved = [],
    token = 'smena_int_12345678-1234-1234-1234-123456789abc.' + 'a'.repeat(43);
  const setup = await startBrowserLogin({ save: async value => saved.push(value) });
  void setup.done.catch(() => {});
  const url = new URL(setup.url),
    nonce = url.pathname.slice(1);
  const headers = { Origin: url.origin, 'Content-Type': 'application/x-www-form-urlencoded' };
  const body = new URLSearchParams({ nonce, token });
  try {
    const page = await fetch(url);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /type="password"/);
    assert.equal((await fetch(url, { method: 'POST', headers: { ...headers, Origin: 'https://untrusted.example' }, body })).status, 403);
    const rebound = await new Promise((resolve, reject) => {
      http
        .get(url, { headers: { Host: 'untrusted.example' } }, response => {
          response.resume();
          resolve(response.statusCode);
        })
        .on('error', reject);
    });
    assert.equal(rebound, 404);
    assert.equal((await fetch(url, { method: 'POST', headers, body: new URLSearchParams({ token, nonce: 'bad' }) })).status, 403);
    assert.equal((await fetch(url, { method: 'POST', headers, body: new URLSearchParams({ nonce, token: 'not-a-token' }) })).status, 400);
    assert.deepEqual(saved, []);
    const result = await fetch(url, { method: 'POST', headers, body });
    assert.equal(result.status, 200);
    assert.equal((await result.text()).includes(token), false);
    await setup.done;
    assert.deepEqual(saved, [token]);
    await assert.rejects(fetch(url));
  } finally {
    setup.close();
  }
});

test('failed credential validation can be corrected before the local setup expires', async () => {
  let calls = 0;
  const setup = await startBrowserLogin({
    save: async () => {
      if (++calls === 1) throw new Error('secret must not be echoed');
    },
  });
  const url = new URL(setup.url);
  const request = {
    method: 'POST',
    headers: { Origin: url.origin, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ nonce: url.pathname.slice(1), token: 'smena_int_12345678-1234-1234-1234-123456789abc.' + 'a'.repeat(43) }),
  };
  const failed = await fetch(url, request);
  assert.equal(failed.status, 400);
  assert.equal((await failed.text()).includes('secret must not be echoed'), false);
  assert.equal((await fetch(url, request)).status, 200);
  await setup.done;
  assert.equal(calls, 2);
});
