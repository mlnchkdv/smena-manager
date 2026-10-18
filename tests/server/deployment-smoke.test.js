import assert from 'node:assert/strict';
import test from 'node:test';
import { smokeDeployment, smokeOrigin } from '../../scripts/smoke-deployment.js';

function response(path) {
  if (path === '/') return new Response('<html><script type="module" src="/assets/app.js"></script></html>', { headers: { 'Content-Type': 'text/html' } });
  if (path === '/api/workspace') return new Response('{}', { status: 401 });
  return new Response(
    JSON.stringify(
      path === '/api/health' ? { status: 'ok', service: 'smena-manager' } : { deploymentReady: true, googleAuthEnabled: true, workspaceStorageAvailable: true },
    ),
    { headers: { 'Content-Type': 'application/json' } },
  );
}

test('deployment smoke only performs public GETs, never sends credentials and rejects exposed workspaces', async () => {
  const fetch = async (url, options) => {
    assert.equal(options.method, 'GET');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'manual');
    assert.ok(options.signal);
    return response(new URL(url).pathname);
  };
  assert.equal((await smokeDeployment('https://smena-manager.vercel.app', { fetch })).length, 4);
  await assert.rejects(
    smokeDeployment('smena-manager.vercel.app', {
      fetch: async url =>
        new URL(url).pathname === '/api/workspace'
          ? new Response('{}')
          : fetch(url, { method: 'GET', credentials: 'omit', redirect: 'manual', signal: AbortSignal.timeout(1000) }),
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

test('deployment smoke rejects configured sign-in when workspace storage cannot be read', async () => {
  await assert.rejects(
    smokeDeployment('example.vercel.app', {
      fetch: async url =>
        new URL(url).pathname === '/api/auth/config'
          ? new Response(JSON.stringify({ deploymentReady: true, googleAuthEnabled: true, workspaceStorageAvailable: false }), {
              headers: { 'Content-Type': 'application/json' },
            })
          : response(new URL(url).pathname),
    }),
    /Workspace storage is unavailable/u,
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

test('protected redirects are never followed and unexpectedly large responses are bounded', async () => {
  let requests = 0;
  await assert.rejects(
    smokeDeployment('example.vercel.app', {
      fetch: async () => {
        requests += 1;
        return new Response(null, { status: 302, headers: { Location: 'https://vercel.com/login' } });
      },
    }),
    /received 302/u,
  );
  assert.equal(requests, 1);
  await assert.rejects(smokeDeployment('example.vercel.app', { fetch: async () => new Response('x'.repeat(1024 * 1024 + 10)) }), /large smoke-check response/u);
});
