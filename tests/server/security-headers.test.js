import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { CONTENT_SECURITY_POLICY, HTTP_SECURITY_HEADERS } from '../../src/shared/http-security.js';

test('application security headers restrict active and privileged browser content', () => {
  assert.match(CONTENT_SECURITY_POLICY, /object-src 'none'/);
  assert.match(CONTENT_SECURITY_POLICY, /script-src 'self'/);
  assert.match(CONTENT_SECURITY_POLICY, /frame-ancestors 'self'/);
  assert.equal(HTTP_SECURITY_HEADERS['X-Content-Type-Options'], 'nosniff');
  assert.match(HTTP_SECURITY_HEADERS['Permissions-Policy'], /camera=\(\)/);
});

test('Vercel static responses use the same security headers as the API', () => {
  const config = JSON.parse(fs.readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));
  const configured = Object.fromEntries(config.headers[0].headers.map(header => [header.key, header.value]));
  assert.deepEqual(configured, HTTP_SECURITY_HEADERS);
});
