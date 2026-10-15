import assert from 'node:assert/strict';
import test from 'node:test';
import { WORKSPACE_TRANSPORT_MAX_BYTES, jsonByteLength, workspaceFitsTransport, workspaceTransportBytes } from '../../src/shared/workspace-size.js';

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
