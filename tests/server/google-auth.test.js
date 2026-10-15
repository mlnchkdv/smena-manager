import assert from 'node:assert/strict';
import test from 'node:test';
import { authenticateGoogleCredential, getGoogleAuthConfiguration, GoogleAuthenticationError } from '../../src/server/google-auth.js';

const profiles = [
  {
    id: 'member-1',
    name: 'Test Member',
    email: 'member@example.com',
    role: 'editor',
    accessId: 'test-access-id',
    active: true,
  },
];

const env = {
  GOOGLE_CLIENT_ID: 'client-id.apps.googleusercontent.com',
  SESSION_SECRET: 'test-session-secret-that-is-long-enough',
  VERCEL: '1',
};

test('Google authentication is enabled only for an allowed origin and an email-linked profile', () => {
  assert.equal(getGoogleAuthConfiguration({ env, profiles, hostname: 'smena-manager.vercel.app' }).enabled, true);
  assert.equal(getGoogleAuthConfiguration({ env, profiles, hostname: 'localhost' }).enabled, false);
  assert.equal(getGoogleAuthConfiguration({ env: { ...env, GOOGLE_LOCALHOST_ENABLED: 'true' }, profiles, hostname: 'localhost' }).enabled, true);
  assert.equal(getGoogleAuthConfiguration({ env, profiles: [{ ...profiles[0], email: '' }], hostname: 'smena-manager.vercel.app' }).enabled, false);
});

test('a verified Google email is mapped to the server-side access profile', async () => {
  const verifyIdToken = async request => {
    assert.deepEqual(request, {
      idToken: 'google-id-token',
      audience: 'client-id.apps.googleusercontent.com',
    });
    return { getPayload: () => ({ email: 'MEMBER@example.com', email_verified: true }) };
  };
  const profile = await authenticateGoogleCredential(' google-id-token ', { env, profiles, verifyIdToken });
  assert.equal(profile.id, 'member-1');
  assert.equal(profile.role, 'editor');
});

test('unverified and non-whitelisted Google accounts are rejected', async () => {
  await assert.rejects(
    authenticateGoogleCredential('token', {
      env,
      profiles,
      verifyIdToken: async () => ({ getPayload: () => ({ email: 'member@example.com', email_verified: false }) }),
    }),
    error => error instanceof GoogleAuthenticationError && error.code === 'GOOGLE_EMAIL_UNVERIFIED' && error.status === 401,
  );
  await assert.rejects(
    authenticateGoogleCredential('token', {
      env,
      profiles,
      verifyIdToken: async () => ({ getPayload: () => ({ email: 'other@example.com', email_verified: true }) }),
    }),
    error => error instanceof GoogleAuthenticationError && error.code === 'GOOGLE_ACCESS_DENIED' && error.status === 403,
  );
});

test('Google token verification failures are normalized without leaking provider details', async () => {
  await assert.rejects(
    authenticateGoogleCredential('token', {
      env,
      profiles,
      verifyIdToken: async () => {
        throw new Error('provider details');
      },
    }),
    error => error instanceof GoogleAuthenticationError && error.code === 'GOOGLE_TOKEN_INVALID' && error.status === 401,
  );
});
