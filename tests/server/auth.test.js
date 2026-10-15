import assert from 'node:assert/strict';
import test from 'node:test';
import { createSession, findProfileByAccessId, findProfileByEmail, getAccessProfiles, publicProfile, verifySession } from '../../src/server/auth.js';

const originalProfiles = process.env.ACCESS_IDS_JSON;
const originalSecret = process.env.SESSION_SECRET;

test.beforeEach(() => {
  process.env.SESSION_SECRET = 'test-session-secret-that-is-long-enough';
  process.env.ACCESS_IDS_JSON = JSON.stringify([
    {
      id: 'member-1',
      name: 'Test Member',
      email: 'member@example.com',
      title: 'Creative Director',
      team: 'design',
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
  assert.equal(findProfileByEmail(' MEMBER@EXAMPLE.COM ')?.id, 'member-1');

  const result = verifySession(createSession(profiles[0]));
  assert.equal(result.profile?.id, 'member-1');
  assert.equal(result.profile?.role, 'editor');
  assert.equal(result.profile?.title, 'Creative Director');
  assert.equal(result.profile?.team, 'design');

  const exposed = publicProfile(profiles[0]);
  assert.equal(exposed.title, 'Creative Director');
  assert.equal(exposed.team, 'design');
  assert.equal('accessId' in exposed, false);
});

test('tampered and expired sessions are rejected', () => {
  const profile = getAccessProfiles()[0];
  const token = createSession(profile);
  assert.equal(verifySession(`${token}x`).profile, undefined);

  const expired = createSession(profile, { issuedAt: 1, expiresAt: 2 });
  assert.equal(verifySession(expired).error, 'Session expired.');
});
