import assert from 'node:assert/strict';
import test from 'node:test';
import { getRedisHealth, hasSharedRedis } from '../../src/server/redis.js';

test('Redis health is explicit when a shared lock is not configured', async () => {
  const original = process.env.REDIS_URL;
  delete process.env.REDIS_URL;
  try {
    assert.equal(hasSharedRedis(), false);
    assert.deepEqual(await getRedisHealth(), { configured: false, connected: false, latencyMs: null });
  } finally {
    if (original === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = original;
  }
});
