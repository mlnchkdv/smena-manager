import assert from 'node:assert/strict';
import test from 'node:test';
import { smokeDeployment, smokeOrigin } from '../../scripts/smoke-deployment.js';

function response(path) {
  if (path === '/') return new Response('<html><script type="module" src="/assets/app.js"></script></html>', { headers: { 'Content-Type': 'text/html' } });
  if (path === '/api/workspace') return new Response('{}', { status: 401 });
  return new Response(
    JSON.stringify(path === '/api/health' ? { status: 'ok', service: 'smena-manager' } : { deploymentReady: true, googleAuthEnabled: true }),
    { headers: { 'Content-Type': 'application/json' } },
  );
}

test('deployment smoke only performs public GETs, never sends credentials and rejects exposed workspaces', async () => {
  const fetch = async (url, options) => {
    assert.equal(options.method, 'GET');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal);
    return response(new URL(url).pathname);
  };
  assert.equal((await smokeDeployment('https://smena-manager.vercel.app', { fetch })).length, 4);
  await assert.rejects(
    smokeDeployment('smena-manager.vercel.app', {
      fetch: async url =>
        new URL(url).pathname === '/api/workspace'
          ? new Response('{}')
          : fetch(url, { method: 'GET', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(1000) }),
    }),
    /expected HTTP 401/u,
  );
});

test('deployment smoke catches broken runtimes and frontend fallback responses', async () => {
  await assert.rejects(smokeDeployment('example.vercel.app', { fetch: async () => new Response('Runtime failed', { status: 500 }) }), /received 500/u);
  await assert.rejects(smokeDeployment('example.vercel.app', { fetch: async () => response('/') }), /expected JSON/u);
  await assert.rejects(
    smokeDeployment('example.vercel.app', {
      fetch: async url =>
        new URL(url).pathname === '/api/auth/config'
          ? new Response('{"deploymentReady":false}', { headers: { 'Content-Type': 'application/json' } })
          : response(new URL(url).pathname),
    }),
    /not ready/u,
  );
});

test('deployment target cannot contain secrets, arbitrary external origins or unsafe URL schemes', () => {
  assert.equal(smokeOrigin('smena-manager.vercel.app'), 'https://smena-manager.vercel.app');
  assert.equal(smokeOrigin('http://127.0.0.1:5205'), 'http://127.0.0.1:5205');
  for (const value of [
    'https://user:secret@example.vercel.app',
    'https://example.vercel.app/?token=secret',
    'https://example.vercel.app/path',
    'http://example.vercel.app',
    'https://example.com',
    'file:///etc/passwd',
  ])
    assert.throws(() => smokeOrigin(value));
});
