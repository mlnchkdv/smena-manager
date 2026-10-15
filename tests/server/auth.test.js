import assert from 'node:assert/strict';
import test from 'node:test';
import { createSession, findProfileByAccessId, getAccessProfiles, verifySession } from '../../src/server/auth.js';

const originalProfiles = process.env.ACCESS_IDS_JSON;
const originalSecret = process.env.SESSION_SECRET;

test.beforeEach(() => {
  process.env.SESSION_SECRET = 'test-session-secret-that-is-long-enough';
  process.env.ACCESS_IDS_JSON = JSON.stringify([
    {
      id: 'member-1',
      name: 'Test Member',
      email: 'member@example.com',
      role: 'editor',
      accessId: 'test-access-id',
      active: true,
    },
  ]);
});

test.after(() => {
  if (originalProfiles === undefined) delete process.env.ACCESS_IDS_JSON;
  else process.env.ACCESS_IDS_JSON = originalProfiles;
  if (originalSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = originalSecret;
});

test('access profiles are normalized and access IDs are not exposed by sessions', () => {
  const profiles = getAccessProfiles();
  assert.equal(profiles.length, 1);
  assert.equal(findProfileByAccessId('test-access-id')?.id, 'member-1');

  const result = verifySession(createSession(profiles[0]));
  assert.equal(result.profile?.id, 'member-1');
  assert.equal(result.profile?.role, 'editor');
});

test('tampered and expired sessions are rejected', () => {
  const profile = getAccessProfiles()[0];
  const token = createSession(profile);
  assert.equal(verifySession(`${token}x`).profile, undefined);

  const expired = createSession(profile, { issuedAt: 1, expiresAt: 2 });
  assert.equal(verifySession(expired).error, 'Session expired.');
});
