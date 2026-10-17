import assert from 'node:assert/strict';
import test from 'node:test';
import { AuthSessionRegistry, describeUserAgent } from '../../src/server/auth-session-store.js';

class MemorySessionStorage {
  sessions = [];

  async loadAuthSessions() {
    return structuredClone(this.sessions);
  }

  async saveAuthSessions(sessions) {
    this.sessions = structuredClone(sessions);
  }
}

function details(id, userId, now, overrides = {}) {
  return {
    id,
    userId,
    device: 'Windows · Chrome 141',
    os: 'Windows',
    browser: 'Chrome 141',
    mobile: false,
    locale: 'ru-RU',
    authMethod: 'google',
    createdAt: now,
    lastSeenAt: now,
    expiresAt: now + 7 * 24 * 60 * 60 * 1000,
    ...overrides,
  };
}

test('missing sessions cannot be recreated by presenting an old signed token', async () => {
  const now = Date.now();
  const provider = new MemorySessionStorage();
  const registry = new AuthSessionRegistry({ provider: () => provider, now: () => now });
  assert.equal(await registry.ensure(details('missing', 'user-1', now)), null);
  assert.deepEqual(provider.sessions, []);
});

test('revoked tombstones survive session limits and other warm instances observe revocation', async () => {
  const now = Date.now();
  const provider = new MemorySessionStorage();
  const first = new AuthSessionRegistry({ provider: () => provider, now: () => now, cacheDurationMs: 60000 });
  const second = new AuthSessionRegistry({ provider: () => provider, now: () => now, cacheDurationMs: 60000 });
  await first.register(details('revoked', 'user-1', now));
  assert.ok(await second.ensure(details('revoked', 'user-1', now)));
  await first.revoke('user-1', 'revoked');
  assert.equal(await second.ensure(details('revoked', 'user-1', now)), null);
  provider.sessions.push(...Array.from({ length: 501 }, (_, i) => details(`session-${i}`, 'user-2', now)));
  await assert.rejects(first.register(details('overflow', 'user-2', now)), { code: 'SESSION_LIMIT' });
  assert.ok(provider.sessions.find(record => record.id === 'revoked').revokedAt);
  assert.equal(await first.ensure(details('revoked', 'user-1', now)), null);
});

test('user agent descriptions identify common desktop and mobile devices', () => {
  assert.deepEqual(describeUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0.0.0 Safari/537.36'), {
    device: 'Windows · Chrome 141',
    os: 'Windows',
    browser: 'Chrome 141',
    mobile: false,
  });
  assert.deepEqual(describeUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile/15E148 Safari/604.1'), {
    device: 'iPhone · Safari 18',
    os: 'iPhone',
    browser: 'Safari 18',
    mobile: true,
  });
});

test('session registry lists only the user sessions and enforces revocation', async () => {
  let now = Date.parse('2026-10-17T12:00:00.000Z');
  const provider = new MemorySessionStorage();
  const registry = new AuthSessionRegistry({ provider: () => provider, now: () => now, cacheDurationMs: 0, touchIntervalMs: 60_000 });

  await registry.register(details('current', 'user-1', now));
  await registry.register(details('phone', 'user-1', now - 60_000, { device: 'iPhone · Safari 18', mobile: true }));
  await registry.register(details('other-user', 'user-2', now));

  const listed = await registry.list('user-1', 'current');
  assert.deepEqual(
    listed.map(session => [session.id, session.current]),
    [
      ['current', true],
      ['phone', false],
    ],
  );
  assert.equal('userId' in listed[0], false);

  assert.equal(await registry.revoke('user-1', 'phone'), true);
  assert.equal(await registry.ensure(details('phone', 'user-1', now)), null);
  assert.deepEqual(
    (await registry.list('user-1', 'current')).map(session => session.id),
    ['current'],
  );

  await registry.register(details('tablet', 'user-1', now));
  assert.equal(await registry.revokeOthers('user-1', 'current'), 1);
  assert.deepEqual(
    (await registry.list('user-1', 'current')).map(session => session.id),
    ['current'],
  );

  now += 2 * 60_000;
  const touched = await registry.ensure(details('current', 'user-1', Date.parse('2026-10-17T12:00:00.000Z')));
  assert.equal(touched.lastSeenAt, '2026-10-17T12:02:00.000Z');
});
