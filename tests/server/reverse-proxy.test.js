import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { configureReverseProxy, loginClientAddress } from '../../src/server/reverse-proxy.js';
import { createLoginRateLimiter } from '../../src/server/login-rate-limit.js';

test('VPS login IPs are distinct behind the opted-in loopback proxy; direct requests ignore forwarded IPs', async t => {
  for (const enabled of [false, true]) {
    const env = enabled ? { TRUST_PROXY: 'loopback' } : {};
    const app = express();
    configureReverseProxy(app, env);
    const limiter = createLoginRateLimiter({ maxAttempts: 1 });
    app.get('/', (request, response) => {
      const ip = loginClientAddress(request, env);
      const allowed = limiter.check(ip).allowed;
      limiter.recordFailure(ip);
      response.json({ ip, allowed });
    });
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const first = await (await fetch(origin, { headers: { 'X-Forwarded-For': '203.0.113.5' } })).json();
    const second = await (await fetch(origin, { headers: { 'X-Forwarded-For': '203.0.113.6' } })).json();
    assert.equal(second.allowed, enabled);
    assert.equal(first.ip === second.ip, !enabled);
    if (enabled) {
      assert.equal(first.ip, '203.0.113.5');
      assert.equal(app.get('trust proxy fn')('198.51.100.1'), false);
      assert.equal(app.get('trust proxy fn')('127.0.0.1'), true);
    }
  }
});

test('Vercel address handling is unchanged and arbitrary proxy modes are not enabled', () => {
  const request = { get: () => '203.0.113.1, 198.51.100.4', socket: { remoteAddress: '127.0.0.1' }, ip: 'wrong' };
  assert.equal(loginClientAddress(request, { VERCEL: '1' }), '203.0.113.1');
  assert.equal(loginClientAddress(request, {}), '127.0.0.1');
  const app = express();
  configureReverseProxy(app, { TRUST_PROXY: 'true' });
  assert.equal(app.get('trust proxy'), false);
});
