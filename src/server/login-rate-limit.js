const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_MAX_ATTEMPTS = 20;
const DEFAULT_MAX_ENTRIES = 10_000;

export function createLoginRateLimiter(options = {}) {
  const windowMs = options.windowMs || DEFAULT_WINDOW_MS;
  const maxAttempts = options.maxAttempts || DEFAULT_MAX_ATTEMPTS;
  const maxEntries = options.maxEntries || DEFAULT_MAX_ENTRIES;
  const now = options.now || Date.now;
  const attempts = new Map();

  function removeExpired(timestamp) {
    for (const [key, record] of attempts) {
      if (record.resetAt <= timestamp) attempts.delete(key);
    }
  }

  function check(key) {
    const timestamp = now();
    removeExpired(timestamp);
    const record = attempts.get(key);
    if (!record || record.count < maxAttempts) return { allowed: true, retryAfterMs: 0 };
    return { allowed: false, retryAfterMs: Math.max(1, record.resetAt - timestamp) };
  }

  function recordFailure(key) {
    const timestamp = now();
    removeExpired(timestamp);
    const record = attempts.get(key);
    if (record) {
      record.count += 1;
      return record.count;
    }
    if (attempts.size >= maxEntries) attempts.delete(attempts.keys().next().value);
    attempts.set(key, { count: 1, resetAt: timestamp + windowMs });
    return 1;
  }

  return {
    check,
    recordFailure,
    recordSuccess: key => attempts.delete(key),
    reset: () => attempts.clear(),
    size: () => attempts.size,
  };
}
