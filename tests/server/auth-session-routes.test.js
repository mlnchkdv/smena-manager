import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { app } from '../../src/server/app.js';
import { resetStorageProvider } from '../../src/server/storage/index.js';
import { getWorkspaceDatabase, replaceWorkspaceDatabase, resetWorkspaceStore } from '../../src/server/workspace-store.js';

test('authenticated users can inspect and revoke their active sessions', async t => {
  const directory = path.join(process.cwd(), '.data', 'tests', `auth-session-routes-${process.pid}`);
  await fs.promises.rm(directory, { recursive: true, force: true });
  process.env.DATABASE_PATH = path.join(directory, 'workspace.json');
  process.env.SESSION_SECRET = 'auth-session-route-secret-that-is-long-enough';
  process.env.ACCESS_ID_LOGIN_ENABLED = 'true';
  process.env.ACCESS_IDS_JSON = JSON.stringify([
    { id: 'session-user', name: 'Session User', email: 'sessions@example.test', role: 'editor', accessId: 'session-access-id', active: true },
  ]);
  delete process.env.VERCEL;
  resetStorageProvider();
  resetWorkspaceStore();
  t.after(async () => {
    resetStorageProvider();
    resetWorkspaceStore();
    delete process.env.DATABASE_PATH;
    delete process.env.SESSION_SECRET;
    delete process.env.ACCESS_ID_LOGIN_ENABLED;
    delete process.env.ACCESS_IDS_JSON;
    await fs.promises.rm(directory, { recursive: true, force: true });
  });

  const initial = await getWorkspaceDatabase();
  await replaceWorkspaceDatabase(
    {
      ...initial,
      me: 'session-user',
      members: [{ id: 'session-user', name: 'Session User', email: 'sessions@example.test', status: 'active' }],
    },
    0,
  );

  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const login = async userAgent => {
    const response = await fetch(`${origin}/api/auth/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': userAgent, 'Accept-Language': 'ru-RU' },
      body: JSON.stringify({ accessId: 'session-access-id' }),
    });
    assert.equal(response.status, 200);
    const cookie = response.headers.get('set-cookie');
    assert.match(cookie, /HttpOnly/u);
    assert.match(cookie, /SameSite=Lax/u);
    const cookieAccess = await fetch(`${origin}/api/auth/me`, { headers: { Cookie: cookie.split(';')[0] } });
    assert.equal(cookieAccess.status, 200);
    return (await response.json()).token;
  };
  const authorize = token => ({ Authorization: `Bearer ${token}` });

  const desktopToken = await login('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/141.0.0.0 Safari/537.36');
  const phoneToken = await login('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile/15E148 Safari/604.1');

  const loginAlerts = (await getWorkspaceDatabase()).notifs.filter(notification => notification.type === 'security');
  assert.equal(loginAlerts.length, 2);
  assert.equal(loginAlerts[0].recipient, 'session-user');
  assert.match(loginAlerts[0].snippet, /iPhone · Safari 18/u);

  const sessionsResponse = await fetch(`${origin}/api/auth/sessions`, { headers: authorize(desktopToken) });
  assert.equal(sessionsResponse.status, 200);
  const sessions = (await sessionsResponse.json()).sessions;
  assert.equal(sessions.length, 2);
  assert.equal(sessions.find(session => session.current)?.device, 'Windows · Chrome 141');
  const phone = sessions.find(session => session.mobile);
  assert.equal(phone.device, 'iPhone · Safari 18');
  assert.equal('userId' in phone, false);

  const revokeResponse = await fetch(`${origin}/api/auth/sessions/${encodeURIComponent(phone.id)}`, {
    method: 'DELETE',
    headers: authorize(desktopToken),
  });
  assert.equal(revokeResponse.status, 200);
  assert.equal((await fetch(`${origin}/api/auth/me`, { headers: authorize(phoneToken) })).status, 401);
  assert.equal((await fetch(`${origin}/api/auth/me`, { headers: authorize(desktopToken) })).status, 200);

  const tabletToken = await login('Mozilla/5.0 (Linux; Android 15; Pixel Tablet) Chrome/141.0.0.0 Safari/537.36');
  const revokeOthers = await fetch(`${origin}/api/auth/sessions/others`, { method: 'DELETE', headers: authorize(desktopToken) });
  assert.equal(revokeOthers.status, 200);
  assert.equal((await revokeOthers.json()).revoked, 1);
  assert.equal((await fetch(`${origin}/api/auth/me`, { headers: authorize(tabletToken) })).status, 401);

  assert.equal((await fetch(`${origin}/api/auth/session`, { method: 'DELETE', headers: authorize(desktopToken) })).status, 200);
  assert.equal((await fetch(`${origin}/api/auth/me`, { headers: authorize(desktopToken) })).status, 401);
});
