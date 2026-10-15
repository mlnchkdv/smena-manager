import crypto from 'node:crypto';
import Redis from 'ioredis';

let client;

export function hasSharedRedis() {
  return Boolean(process.env.REDIS_URL?.trim());
}

function getRedisClient() {
  if (!hasSharedRedis()) throw new Error('REDIS_URL is not configured.');
  if (!client) {
    client = new Redis(process.env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
    });
    client.on('error', error => console.error('[Redis]', error.message));
  }
  return client;
}

async function ensureConnected(redis) {
  if (redis.status === 'wait') await redis.connect();
}

function wait(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

export async function withRedisLock(key, action, options = {}) {
  const redis = getRedisClient();
  await ensureConnected(redis);
  const token = crypto.randomUUID();
  const ttlMs = options.ttlMs || 60_000;
  const waitMs = options.waitMs || 15_000;
  const deadline = Date.now() + waitMs;

  while (Date.now() < deadline) {
    const acquired = await redis.set(key, token, 'PX', ttlMs, 'NX');
    if (acquired === 'OK') {
      try {
        return await action();
      } finally {
        await redis
          .eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end", 1, key, token)
          .catch(error => console.error('[Redis] Could not release lock:', error.message));
      }
    }
    await wait(100 + Math.floor(Math.random() * 100));
  }
  throw new WorkspaceCoordinationError('Timed out waiting for the workspace write lock.');
}

export class WorkspaceCoordinationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'WorkspaceCoordinationError';
    this.statusCode = 503;
    this.code = 'WORKSPACE_COORDINATION_UNAVAILABLE';
  }
}

export function resetRedisClient() {
  if (client) client.disconnect();
  client = undefined;
}
