import fs from 'node:fs/promises';
import path from 'node:path';
import { domainToASCII } from 'node:url';
import { isIP } from 'node:net';
import { HTTP_SECURITY_HEADERS } from '../../src/shared/http-security.js';
import { googleGrantPolicy } from '../../src/shared/google-grant-policy.js';

export const ROOT = '/srv/smena-manager';
export const ENV_FILE = '/etc/smena-manager/smena.env';
export const PROFILE_FILE = '/etc/smena-manager/access-ids.json';
export const MARKER = '# Managed by Smena Manager VPS kit';
export const releasePattern = /^[a-f0-9]{40}-[a-f0-9-]{36}$/;

export function domainName(input) {
  if (typeof input !== 'string' || /[\s/\\:@?#*;'"%]/.test(input)) throw new Error('Use one DNS domain without URL syntax.');
  const domain = domainToASCII(String(input || '').toLowerCase());
  if (isIP(domain) || domain.length > 253 || !domain.includes('.') || !domain.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)))
    throw new Error('Use one DNS domain, without scheme, port, path or wildcard.');
  return domain;
}
export function safeRef(ref) {
  if (typeof ref !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9/_.-]{0,199}$/.test(ref) || ref.includes('..')) throw new Error('Invalid Git ref.');
  return ref;
}
export function domainInNginxDump(dump, domain) {
  const text = dump.replace(/#.*$/gm, '');
  return [...text.matchAll(/\bserver_name\s+([^;]+);/g)].some(match =>
    match[1]
      .trim()
      .split(/\s+/)
      .some(name => name === domain || ((name.startsWith('*.') || name.startsWith('.')) && domain.endsWith('.' + name.replace(/^\*?\./, '')))),
  );
}
export function releasePath(id, root = ROOT) {
  if (!releasePattern.test(id || '')) throw new Error('Invalid release identity.');
  return path.join(root, 'releases', id);
}
export function parseVpsEnv(text) {
  const env = {};
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Z][A-Z0-9_]*)=([^\s"'`\\#]*)$/);
    if (!match || Object.hasOwn(env, match[1])) throw new Error(`Invalid or duplicate environment assignment on line ${index + 1}. Use literal KEY=value.`);
    env[match[1]] = match[2];
  }
  return env;
}
const placeholder = value => !value || /CHANGE|GENERATE|PRESERVE_EXISTING|<|>/.test(value);

export function validateVpsEnvironment(env, profiles, domain) {
  const issues = [];
  const require = (valid, key) => {
    if (!valid) issues.push(key);
  };
  require(env.NODE_ENV === 'production', 'NODE_ENV');
  require(env.PORT === '3001', 'PORT');
  require(env.TRUST_PROXY === 'loopback', 'TRUST_PROXY');
  require(env.APP_ORIGIN === `https://${domainName(domain)}`, 'APP_ORIGIN');
  require(env.WORKSPACE_WRITE_MODE === 'drive', 'WORKSPACE_WRITE_MODE');
  require(env.ACCESS_ID_LOGIN_ENABLED === 'false', 'ACCESS_ID_LOGIN_ENABLED');
  require(env.ACCESS_IDS_PATH === PROFILE_FILE, 'ACCESS_IDS_PATH');
  require(!Object.hasOwn(env, 'VERCEL'), 'REMOVE_VERCEL');
  require(!env.REDIS_URL, 'REMOVE_REDIS_URL_SINGLE_PROCESS_MODE');
  for (const key of ['PATH', 'HOME', 'NODE_PATH', 'LD_PRELOAD', 'LD_LIBRARY_PATH', 'ACCESS_IDS_JSON']) require(!Object.hasOwn(env, key), `REMOVE_${key}`);
  require(!env.NODE_OPTIONS || /^--max-old-space-size=(512|1024|1536|2048|3072|4096)$/.test(env.NODE_OPTIONS), 'NODE_OPTIONS');
  for (const key of ['SESSION_SECRET', 'CRON_SECRET']) require(!placeholder(env[key]) && env[key].length >= 32, key);
  if (env.MONITOR_SECRET)
    require(!placeholder(env.MONITOR_SECRET) &&
      env.MONITOR_SECRET.length >= 32 &&
      ![env.SESSION_SECRET, env.CRON_SECRET].includes(env.MONITOR_SECRET), 'MONITOR_SECRET');
  require(!placeholder(env.GOOGLE_CLIENT_ID) && env.GOOGLE_CLIENT_ID.endsWith('.apps.googleusercontent.com'), 'GOOGLE_CLIENT_ID');
  for (const key of ['GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN']) require(!placeholder(env[key]) && env[key].length >= 16, key);
  for (const key of ['FOLDER', 'DATABASE_FILE', 'UPLOADS_FOLDER', 'BACKUPS_FOLDER', 'SESSIONS_FILE', 'PUSH_FILE', 'DELIVERY_FILE']) {
    const name = `GOOGLE_DRIVE_${key}_ID`;
    require(!placeholder(env[name]) && /^[a-zA-Z0-9_-]{8,}$/.test(env[name]), name);
  }
  for (const [key, expected] of Object.entries({
    DATABASE_PATH: '/var/lib/smena-manager/workspace.json',
    UPLOADS_PATH: '/var/lib/smena-manager/uploads',
    BACKUPS_PATH: '/var/lib/smena-manager/backups',
  }))
    require(env[key] === expected, key);
  const active = Array.isArray(profiles) ? profiles.filter(profile => profile.active !== false) : [];
  require(active.length > 0 && active.some(profile => profile.role === 'admin'), 'ACCESS_PROFILES_ADMIN');
  for (const key of ['id', 'accessId', 'email'])
    require(new Set(active.map(profile => String(profile[key] || '').toLowerCase())).size === active.length, `ACCESS_PROFILES_UNIQUE_${key}`);
  require(active.every(
    profile =>
      !placeholder(profile.id) &&
      !placeholder(profile.accessId) &&
      profile.accessId.length >= 16 &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email || '') &&
      !/@example\.(com|org|net|test)$/i.test(profile.email) &&
      ['admin', 'editor', 'viewer'].includes(profile.role),
  ), 'ACCESS_PROFILES_VALUES');
  if (env.EMAIL_FROM || env.GMAIL_OAUTH_REFRESH_TOKEN) {
    require(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.EMAIL_FROM || ''), 'EMAIL_FROM');
    require(!placeholder(env.GMAIL_OAUTH_REFRESH_TOKEN) && env.GMAIL_OAUTH_REFRESH_TOKEN.length >= 16, 'GMAIL_OAUTH_REFRESH_TOKEN');
  }
  if (env.GMAIL_OAUTH_CLIENT_ID || env.GMAIL_OAUTH_CLIENT_SECRET)
    require(Boolean(env.GMAIL_OAUTH_CLIENT_ID && env.GMAIL_OAUTH_CLIENT_SECRET), 'GMAIL_OAUTH_CLIENT_PAIR');
  const grants = googleGrantPolicy(env);
  require(!grants.requireIsolation || !grants.gmailConfigured || grants.gmailIsolated, 'GMAIL_GRANT_SHARED');
  if (env.VAPID_PUBLIC_KEY || env.VAPID_PRIVATE_KEY) {
    for (const [key, length] of [
      ['VAPID_PUBLIC_KEY', 65],
      ['VAPID_PRIVATE_KEY', 32],
    ])
      require(/^[a-zA-Z0-9_-]+$/.test(env[key] || '') && Buffer.from(env[key] || '', 'base64url').length === length, key);
    require(/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.VAPID_SUBJECT || ''), 'VAPID_SUBJECT');
  }
  if (issues.length) throw new Error(`VPS configuration rejected: ${[...new Set(issues)].join(', ')}. Values are not logged.`);
  return { gmail: Boolean(env.GMAIL_OAUTH_REFRESH_TOKEN), push: Boolean(env.VAPID_PUBLIC_KEY) };
}

export async function loadProtectedEnvironment(domain, { envFile = ENV_FILE, profileFile = PROFILE_FILE, checkPermissions = true } = {}) {
  for (const file of [envFile, profileFile]) {
    const info = await fs.lstat(file);
    if (!info.isFile() || (checkPermissions && (info.uid !== 0 || (info.mode & 0o027) !== 0)))
      throw new Error('Configuration must be regular root-owned files, mode 0640 or stricter.');
  }
  const env = parseVpsEnv(await fs.readFile(envFile, 'utf8'));
  let profiles;
  try {
    profiles = JSON.parse(await fs.readFile(profileFile, 'utf8'));
  } catch {
    throw new Error('Invalid access profile JSON. Values are not logged.');
  }
  const features = validateVpsEnvironment(env, profiles, domain);
  return { env, features };
}

export async function renderTemplates(domain, node, { tls = true, templateDir = new URL('./templates/', import.meta.url) } = {}) {
  domain = domainName(domain);
  if (!/^\/[a-zA-Z0-9/_.-]+$/.test(node)) throw new Error('Use an absolute Node binary path without spaces.');
  const values = {
    DOMAIN: domain,
    NODE: node,
    NODE_DIR: path.dirname(node),
    HIDE_SECURITY_HEADERS: Object.keys(HTTP_SECURITY_HEADERS)
      .map(key => `proxy_hide_header ${key};`)
      .join('\n'),
  };
  const files = {
    '/etc/nginx/sites-available/smena-manager.conf': tls ? 'nginx-site.conf.in' : 'nginx-bootstrap.conf.in',
    '/etc/nginx/snippets/smena-manager-proxy.conf': 'nginx-proxy.conf.in',
    '/etc/nginx/snippets/smena-manager-static-gzip.conf': 'nginx-static-gzip.conf.in',
    '/etc/systemd/system/smena-manager.service': 'smena-manager.service.in',
    '/etc/systemd/system/smena-manager-cron.service': 'smena-manager-cron.service.in',
    '/etc/systemd/system/smena-manager-cron.timer': 'smena-manager-cron.timer.in',
    '/etc/systemd/system/smena-manager-monitor.service': 'smena-manager-monitor.service.in',
    '/etc/systemd/system/smena-manager-monitor.timer': 'smena-manager-monitor.timer.in',
    '/etc/letsencrypt/renewal-hooks/deploy/smena-manager-nginx.sh': 'certbot-reload.sh.in',
  };
  const rendered = new Map();
  for (const [file, template] of Object.entries(files)) {
    const source = await fs.readFile(new URL(template, templateDir), 'utf8');
    const text = source.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => {
      if (!(key in values)) throw new Error('Unknown template variable.');
      return values[key];
    });
    rendered.set(file, text);
  }
  rendered.set(
    '/etc/nginx/snippets/smena-manager-security.conf',
    MARKER +
      '\n' +
      Object.entries(HTTP_SECURITY_HEADERS)
        .map(([key, value]) => `add_header ${key} "${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}" always;`)
        .join('\n') +
      '\n',
  );
  return rendered;
}

export function cronResult(result) {
  return result?.status === 'ok' && Array.isArray(result.workspaces) && result.workspaces.length > 0 && result.workspaces.every(item => item.status === 'ok');
}
