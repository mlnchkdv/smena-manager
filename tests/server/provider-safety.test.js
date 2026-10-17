import assert from 'node:assert/strict';
import test from 'node:test';
import { configureProviderTimeout, safeProviderError } from '../../src/server/provider-safety.js';

test('provider diagnostics never serialize tokens, request headers, URLs or payloads', () => {
  const error = {
    code: 'ETIMEDOUT',
    message: 'Bearer secret',
    response: { status: 503, data: 'private note' },
    config: { url: 'https://secret-upload-url', headers: { Authorization: 'Bearer token' } },
  };
  assert.deepEqual(safeProviderError(error), { code: 'ETIMEDOUT', status: 503 });
  assert.deepEqual(safeProviderError({ code: 'Bearer secret', message: 'secret' }), { code: 'PROVIDER_ERROR', status: null });
  const client = { transporter: { defaults: {} } };
  assert.equal(configureProviderTimeout(client), client);
  assert.deepEqual(client.transporter.defaults, { timeout: 15000, retry: false });
});
