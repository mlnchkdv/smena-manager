import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVpsEnv, validateVpsEnvironment, renderTemplates, domainName, releasePath } from '../../deploy/vps/lib.mjs';
import { invokeCron } from '../../deploy/vps/cron.mjs';

const profiles = [{ id: 'existing-admin', email: 'admin@team.invalid', role: 'admin', accessId: 'synthetic-unique-access-value', active: true }];
const fixture = () => ({
  NODE_ENV: 'production',
  PORT: '3001',
  TRUST_PROXY: 'loopback',
  APP_ORIGIN: 'https://tasks.team.invalid',
  WORKSPACE_WRITE_MODE: 'drive',
  ACCESS_ID_LOGIN_ENABLED: 'false',
  ACCESS_IDS_PATH: '/etc/smena-manager/access-ids.json',
  SESSION_SECRET: 's'.repeat(40),
  CRON_SECRET: 'c'.repeat(40),
  GOOGLE_CLIENT_ID: 'synthetic.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'synthetic-client-secret',
  GOOGLE_REFRESH_TOKEN: 'synthetic-refresh-token',
  ...Object.fromEntries(
    ['FOLDER', 'DATABASE_FILE', 'UPLOADS_FOLDER', 'BACKUPS_FOLDER', 'SESSIONS_FILE', 'PUSH_FILE', 'DELIVERY_FILE'].map(key => [
      `GOOGLE_DRIVE_${key}_ID`,
      `synthetic-${key}`,
    ]),
  ),
  DATABASE_PATH: '/var/lib/smena-manager/workspace.json',
  UPLOADS_PATH: '/var/lib/smena-manager/uploads',
  BACKUPS_PATH: '/var/lib/smena-manager/backups',
});

test('VPS preflight fails closed instead of local fallback, ephemeral sessions or hidden access-ID login', () => {
  assert.deepEqual(validateVpsEnvironment(fixture(), profiles, 'tasks.team.invalid'), { gmail: false, push: false });
  for (const patch of [
    { GOOGLE_REFRESH_TOKEN: '' },
    { SESSION_SECRET: 'short' },
    { ACCESS_ID_LOGIN_ENABLED: 'true' },
    { VERCEL: '' },
    { REDIS_URL: 'redis://wrong' },
    { APP_ORIGIN: 'http://tasks.team.invalid' },
    { NODE_OPTIONS: '--inspect=0.0.0.0' },
    { ACCESS_IDS_JSON: '[{}]' },
    { GOOGLE_DRIVE_DATABASE_FILE_ID: 'CHANGE' },
  ])
    assert.throws(() => validateVpsEnvironment({ ...fixture(), ...patch }, profiles, 'tasks.team.invalid'));
  assert.throws(() => validateVpsEnvironment(fixture(), [], 'tasks.team.invalid'));
  assert.throws(() => validateVpsEnvironment(fixture(), [...profiles, { ...profiles[0] }], 'tasks.team.invalid'));
});

test('environment parsing is literal and never evaluates shell, quoting or duplicate assignments', () => {
  assert.equal(parseVpsEnv('SESSION_SECRET=$(touch/tmp/x)\n').SESSION_SECRET, '$(touch/tmp/x)');
  assert.equal(parseVpsEnv('#comment\nPORT=3001\nEMPTY=\n').PORT, '3001');
  for (const source of ['export PORT=3001', 'PORT="3001"', 'PORT=3001 #comment', 'PORT=3001\nPORT=4', 'FOO=one two', 'FOO=one\\two'])
    assert.throws(() => parseVpsEnv(source));
  for (const domain of ['x;touch/tmp/x', 'https://team.invalid', '*.team.invalid', '127.0.0.1', 'team.invalid/path']) assert.throws(() => domainName(domain));
  assert.throws(() => releasePath('../outside'));
});

test('rendered VPS configs retain API paths, trusted proxy boundaries, Google security and cache rules', async () => {
  const files = await renderTemplates('tasks.team.invalid', '/opt/smena-node/bin/node');
  const site = files.get('/etc/nginx/sites-available/smena-manager.conf');
  const proxy = files.get('/etc/nginx/snippets/smena-manager-proxy.conf');
  const headers = files.get('/etc/nginx/snippets/smena-manager-security.conf');
  assert.match(site, /location \^~ \/api\/cron\/ \{ return 404; \}/);
  assert.match(site, /gzip off;/);
  assert.match(site, /location \^~ \/api\/monitor\/ \{ return 404; \}/);
  assert.match(files.get('/etc/nginx/snippets/smena-manager-static-gzip.conf'), /gzip_vary on;/);
  assert.doesNotMatch(proxy, /gzip on/);
  assert.match(site, /shared/);
  assert.match(site, /try_files \$uri =404/);
  assert.match(proxy, /proxy_pass http:\/\/127\.0\.0\.1:3001;/);
  assert.match(proxy, /X-Forwarded-For \$remote_addr;/);
  assert.doesNotMatch(proxy, /proxy_add_x_forwarded_for/);
  assert.match(headers, /same-origin-allow-popups/);
  assert.match(headers, /script-src 'self' https:\/\/accounts.google.com/);
  const unit = files.get('/etc/systemd/system/smena-manager.service');
  assert.match(unit, /User=smena/);
  assert.match(unit, /MemoryMax=4G/);
  assert.doesNotMatch(unit, /--watch|preview|VERCEL=/);
  assert.match(files.get('/etc/systemd/system/smena-manager-cron.timer'), /08:00:00 Europe\/Saratov/);
  assert.match(files.get('/etc/systemd/system/smena-manager-cron.timer'), /Persistent=true/);
  assert.match(files.get('/etc/letsencrypt/renewal-hooks/deploy/smena-manager-nginx.sh'), /nginx -t\n\/usr\/bin\/systemctl reload nginx.service/);
  const bootstrap = await renderTemplates('tasks.team.invalid', '/opt/smena-node/bin/node', { tls: false });
  assert.match(bootstrap.get('/etc/nginx/sites-available/smena-manager.conf'), /return 503/);
  assert.doesNotMatch(bootstrap.get('/etc/nginx/sites-available/smena-manager.conf'), /proxy_pass|ssl_certificate/);
});

test('cron helper uses loopback only, never follows redirects and distinguishes HTTP success from execution success', async () => {
  const secret = 's'.repeat(40);
  const call = result =>
    invokeCron({
      secret,
      fetcher: async (url, options) => {
        assert.equal(url, 'http://127.0.0.1:3001/api/cron/reminders');
        assert.equal(options.redirect, 'error');
        assert.equal(options.headers.Authorization, `Bearer ${secret}`);
        return Response.json(result);
      },
    });
  assert.equal((await call({ status: 'ok', workspaces: [{ status: 'ok' }] })).ok, true);
  for (const result of [
    { status: 'ok' },
    { status: 'ok', workspaces: [] },
    { status: 'ok', workspaces: [{ status: 'failed' }] },
    { status: 'degraded', workspaces: [{ status: 'ok' }] },
  ])
    assert.equal((await call(result)).ok, false);
  await assert.rejects(invokeCron({ secret, fetcher: async () => new Response('error', { status: 500 }) }), /HTTP 500/);
  await assert.rejects(invokeCron({ secret, fetcher: async () => new Response('not JSON') }), /invalid JSON/);
});
