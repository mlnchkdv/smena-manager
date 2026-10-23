import assert from 'node:assert/strict';
import test from 'node:test';
import { configureProviderTimeout, safeProviderError, recordProviderFailure, providerFailureCounters } from '../../src/server/provider-safety.js';

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
test('bounded worker counters classify timeouts and quota errors without storing payloads', () => {
  const before = providerFailureCounters();
  recordProviderFailure({ code: 'ETIMEDOUT', message: 'secret' });
  recordProviderFailure({ response: { status: 403, data: { error: { errors: [{ reason: 'storageQuotaExceeded' }] } } } });
  const after = providerFailureCounters();
  assert.equal(after.failures, before.failures + 2);
  assert.equal(after.timeouts, before.timeouts + 1);
  assert.equal(after.quota, before.quota + 1);
  assert.ok(!JSON.stringify(after).includes('secret'));
});
