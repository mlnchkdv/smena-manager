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
      let leaseError = null;
      let renewing = false;
      const renewEveryMs = Math.max(1_000, Math.floor(ttlMs / 3));
      const renewLease = async () => {
        if (renewing || leaseError) return;
        renewing = true;
        try {
          const renewed = await redis.eval(
            "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end",
            1,
            key,
            token,
            ttlMs,
          );
          if (renewed !== 1) leaseError = new WorkspaceCoordinationError('The workspace write lock was lost before the update completed.');
        } catch (error) {
          leaseError = new WorkspaceCoordinationError(`Could not renew the workspace write lock: ${error.message}`);
        } finally {
          renewing = false;
        }
      };
      const renewalTimer = setInterval(() => void renewLease(), renewEveryMs);
      renewalTimer.unref?.();
      try {
        return await action({
          assertOwnership: async () => {
            if (leaseError) throw leaseError;
            const owned = await redis.get(key);
            if (owned !== token) throw new WorkspaceCoordinationError('The workspace write lock is no longer owned by this request.');
          },
        });
      } finally {
        clearInterval(renewalTimer);
        await redis
          .eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end", 1, key, token)
          .catch(error => console.error('[Redis] Could not release lock:', error.message));
      }
    }
    await wait(100 + Math.floor(Math.random() * 100));
  }
  throw new WorkspaceCoordinationError('Timed out waiting for the workspace write lock.');
}

export async function getRedisHealth() {
  if (!hasSharedRedis()) return { configured: false, connected: false, latencyMs: null };
  const startedAt = Date.now();
  try {
    const redis = getRedisClient();
    await ensureConnected(redis);
    const response = await redis.ping();
    return { configured: true, connected: response === 'PONG', latencyMs: Date.now() - startedAt };
  } catch (error) {
    return { configured: true, connected: false, latencyMs: null, error: error.message };
  }
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
