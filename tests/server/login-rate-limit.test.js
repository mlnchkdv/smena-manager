import assert from 'node:assert/strict';
import test from 'node:test';
import { createLoginRateLimiter } from '../../src/server/login-rate-limit.js';

test('login limiter counts only recorded failures and clears them after success', () => {
  const limiter = createLoginRateLimiter({ maxAttempts: 2 });
  assert.equal(limiter.check('office').allowed, true);
  assert.equal(limiter.check('office').allowed, true);

  limiter.recordFailure('office');
  assert.equal(limiter.check('office').allowed, true);
  limiter.recordFailure('office');
  assert.equal(limiter.check('office').allowed, false);

  limiter.recordSuccess('office');
  assert.equal(limiter.check('office').allowed, true);
});

test('login limiter expires windows and bounds retained client records', () => {
  let clock = 1_000;
  const limiter = createLoginRateLimiter({ maxAttempts: 1, maxEntries: 2, windowMs: 500, now: () => clock });
  limiter.recordFailure('one');
  limiter.recordFailure('two');
  limiter.recordFailure('three');
  assert.equal(limiter.size(), 2);
  assert.equal(limiter.check('one').allowed, true);

  clock += 501;
  assert.equal(limiter.check('two').allowed, true);
  assert.equal(limiter.size(), 0);
});
