import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectDeploymentConfig } from '../../src/server/deployment-config.js';

const admin = {
  id: 'admin-1',
  accessId: 'a-secure-access-id-value',
  role: 'admin',
  active: true,
};

test('production config accepts the OAuth2 Drive and Redis setup', () => {
  const report = inspectDeploymentConfig({
    env: {
      SESSION_SECRET: 'a-random-session-secret-with-32-characters',
      GOOGLE_CLIENT_ID: 'client',
      GOOGLE_CLIENT_SECRET: 'secret',
      GOOGLE_REFRESH_TOKEN: 'refresh',
      REDIS_URL: 'rediss://redis.example.test',
    },
    profiles: [admin],
  });

  assert.equal(report.ready, true);
  assert.equal(report.credentialMode, 'oauth2');
});

test('production config accepts explicitly enabled direct Drive writes', () => {
  const report = inspectDeploymentConfig({
    env: {
      SESSION_SECRET: 'a-random-session-secret-with-32-characters',
      GOOGLE_CLIENT_ID: 'client',
      GOOGLE_CLIENT_SECRET: 'secret',
      GOOGLE_REFRESH_TOKEN: 'refresh',
      WORKSPACE_WRITE_MODE: 'drive',
    },
    profiles: [admin],
  });

  assert.equal(report.ready, true);
  assert.deepEqual(
    report.warnings.map(warning => warning.key),
    ['DRIVE_WRITE_CONCURRENCY', 'GOOGLE_DRIVE_DATABASE_FILE_ID', 'GOOGLE_DRIVE_UPLOADS_FOLDER_ID'],
  );
});

test('production config reports incomplete and unsafe values without exposing them', () => {
  const report = inspectDeploymentConfig({
    env: {
      SESSION_SECRET: 'short',
      GOOGLE_SERVICE_ACCOUNT_EMAIL: 'service@example.test',
      GOOGLE_PRIVATE_KEY: 'private-key',
    },
    profiles: [{ ...admin, accessId: 'short' }],
  });

  assert.equal(report.ready, false);
  assert.deepEqual(
    report.issues.map(issue => issue.key),
    ['SESSION_SECRET', 'ACCESS_ID_WEAK', 'GOOGLE_DRIVE_FOLDER_ID', 'WORKSPACE_WRITE_MODE'],
  );
});
