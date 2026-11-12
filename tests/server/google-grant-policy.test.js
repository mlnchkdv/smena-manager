import test from 'node:test';
import assert from 'node:assert/strict';
import { googleGrantPolicy } from '../../src/shared/google-grant-policy.js';
import { inspectDeploymentConfig } from '../../src/server/deployment-config.js';

test('grant isolation requires distinct client and token; declarations do not leak credentials', () => {
  const env = {
    GOOGLE_CLIENT_ID: 'drive',
    GOOGLE_REFRESH_TOKEN: 'secret-drive',
    GMAIL_OAUTH_CLIENT_ID: 'drive',
    GMAIL_OAUTH_CLIENT_SECRET: 'secret-client',
    GMAIL_OAUTH_REFRESH_TOKEN: 'secret-gmail',
  };
  assert.equal(googleGrantPolicy(env).gmailIsolated, false);
  assert.equal(googleGrantPolicy({ ...env, GMAIL_OAUTH_CLIENT_ID: 'mail' }).gmailIsolated, true);
  assert.equal(googleGrantPolicy({ ...env, GMAIL_OAUTH_CLIENT_ID: 'mail', GMAIL_OAUTH_REFRESH_TOKEN: 'secret-drive' }).gmailIsolated, false);
  assert.equal(googleGrantPolicy({ GOOGLE_OAUTH_PUBLISHING_STATUS: 'unverified-value' }).publishingStatus, 'unknown');
  assert.doesNotMatch(JSON.stringify(googleGrantPolicy(env)), /secret/);
});

test('strict isolation rejects shared grant while compatibility mode reports it without breaking existing installations', () => {
  const env = {
    NODE_ENV: 'production',
    SESSION_SECRET: 's'.repeat(40),
    WORKSPACE_WRITE_MODE: 'drive',
    GOOGLE_CLIENT_ID: 'drive',
    GOOGLE_CLIENT_SECRET: 'secret',
    GOOGLE_REFRESH_TOKEN: 'shared-token',
    GMAIL_OAUTH_REFRESH_TOKEN: 'shared-token',
    EMAIL_FROM: 'sender@team.invalid',
    GOOGLE_OAUTH_PUBLISHING_STATUS: 'testing',
  };
  const profiles = [{ id: 'admin', accessId: 'a'.repeat(32), role: 'admin' }];
  const report = inspectDeploymentConfig({ env, profiles });
  assert.equal(report.ready, true);
  assert.ok(report.warnings.some(x => x.key === 'GMAIL_GRANT_SHARED'));
  assert.ok(report.warnings.some(x => x.key === 'GOOGLE_OAUTH_PUBLISHING_STATUS'));
  assert.equal(inspectDeploymentConfig({ env: { ...env, GMAIL_REQUIRE_ISOLATED_GRANT: 'true' }, profiles }).ready, false);
});
