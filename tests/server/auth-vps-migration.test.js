import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { accessIdLoginEnabled } from '../../src/server/auth.js';
import { getGoogleAuthConfiguration } from '../../src/server/google-auth.js';
import { setSessionCookie } from '../../src/server/session-cookie.js';
const profiles = [{ id: 'migration-editor', email: 'migration@example.test', role: 'editor', accessId: 'synthetic-profile-access-only' }];
const secret = 'synthetic-stable-migration-secret-32-chars';
function child(script, changes = {}) {
  const env = { ...process.env, NODE_ENV: 'production', SESSION_SECRET: secret, ACCESS_IDS_JSON: JSON.stringify(profiles), ...changes };
  delete env.VERCEL;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
test('VPS sessions survive a fresh process with the same key, retain server roles and reject a rotated key', () => {
  const token = child(`import {createSession,getAccessProfiles} from './src/server/auth.js'; console.log(createSession(getAccessProfiles()[0]));`);
  const script = `import {verifySession} from './src/server/auth.js'; const value=verifySession(process.env.TEST_TOKEN); console.log(JSON.stringify({id:value.profile?.id,role:value.profile?.role,error:!!value.error}));`;
  assert.deepEqual(JSON.parse(child(script, { TEST_TOKEN: token })), { id: profiles[0].id, role: 'editor', error: false });
  assert.equal(JSON.parse(child(script, { TEST_TOKEN: token, SESSION_SECRET: secret + '-rotated' })).error, true);
  assert.equal(
    child(
      `import {createSession,getAccessProfiles} from './src/server/auth.js'; try {createSession(getAccessProfiles()[0]); process.exit(3);} catch {console.log('refused');}`,
      { SESSION_SECRET: '' },
    ),
    'refused',
  );
});
test('production Google requires a durable key, Access ID defaults off, and cookies stay host-only', () => {
  assert.equal(accessIdLoginEnabled({ NODE_ENV: 'production' }), false);
  assert.equal(accessIdLoginEnabled({ NODE_ENV: 'production', ACCESS_ID_LOGIN_ENABLED: 'true' }), true);
  assert.equal(getGoogleAuthConfiguration({ env: { NODE_ENV: 'production', GOOGLE_CLIENT_ID: 'test.apps.googleusercontent.com' }, profiles }).enabled, false);
  const original = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    let cookie;
    setSessionCookie(
      {
        append: (_key, value) => {
          cookie = value;
        },
      },
      'synthetic',
    );
    for (const attribute of ['HttpOnly', 'SameSite=Lax', 'Secure', 'Path=/']) assert.ok(cookie.includes(attribute));
    assert.equal(cookie.includes('Domain='), false, 'A login on the old host must not share a cookie with the new origin');
  } finally {
    if (original === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = original;
  }
});
