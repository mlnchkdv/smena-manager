import assert from 'node:assert/strict';
import test from 'node:test';
import {
  WORKSPACE_TRANSPORT_MAX_BYTES,
  jsonByteLength,
  workspaceCapacity,
  workspaceFitsTransport,
  workspaceTransportBytes,
} from '../../src/shared/workspace-size.js';

test('JSON byte length measures UTF-8 data instead of JavaScript characters', () => {
  assert.equal(jsonByteLength('a'), 3);
  assert.equal(jsonByteLength('я'), 4);
});

test('workspace transport size includes the API envelope', () => {
  const data = { notes: ['тест'] };
  assert.equal(workspaceTransportBytes(data, 7), jsonByteLength({ data, revision: 7 }));
  assert.equal(workspaceFitsTransport(data, 7), true);
});

test('workspace transport policy rejects data beyond the safe Vercel limit', () => {
  const data = { content: 'x'.repeat(WORKSPACE_TRANSPORT_MAX_BYTES) };
  assert.equal(workspaceFitsTransport(data, 0), false);
});

test('workspace capacity exposes an actionable warning before the hard limit', () => {
  assert.deepEqual(workspaceCapacity(3 * 1024 * 1024), {
    bytes: 3 * 1024 * 1024,
    maxBytes: WORKSPACE_TRANSPORT_MAX_BYTES,
    warningBytes: 3 * 1024 * 1024,
    percent: 75,
    status: 'warning',
  });
  assert.equal(workspaceCapacity(WORKSPACE_TRANSPORT_MAX_BYTES + 1).status, 'over-limit');
});
