import test from 'node:test';
import assert from 'node:assert/strict';
import { createContextLoadGuard } from '../../src/shared/context-load-guard.js';

test('context rerenders cannot become an automatic provider retry loop', () => {
  const guard = createContextLoadGuard();
  assert.equal(guard.begin('session:revision:graph'), true);
  assert.equal(guard.begin('session:revision:graph'), false);
  guard.end('session:revision:graph', true);
  for (let i = 0; i < 1000; i++) assert.equal(guard.begin('session:revision:graph'), false);
  guard.retry();
  assert.equal(guard.begin('session:revision:graph'), true);
});

test('another query or account can load, but a late completion cannot unlock an active request', () => {
  const guard = createContextLoadGuard();
  assert.equal(guard.begin('old'), true);
  guard.end('old', true);
  assert.equal(guard.begin('new'), true);
  guard.end('old');
  assert.equal(guard.begin('third'), false);
  guard.end('new');
  assert.equal(guard.begin('third'), true);
});
