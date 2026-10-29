import { getStorageProvider } from './storage/index.js';
import { storageVersion } from './storage/version-token.js';
import crypto from 'node:crypto';

const CACHE_DURATION_MS = 0;
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;
const MAX_SESSION_RECORDS = 500;

function cleanText(value, maxLength = 80) {
  return [...String(value || '')]
    .map(character => {
      const code = character.codePointAt(0);
      return code < 32 || code === 127 ? ' ' : character;
    })
    .join('')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, maxLength);
}

function iso(value, fallback = Date.now()) {
  const timestamp = new Date(value ?? fallback).getTime();
  return new Date(Number.isFinite(timestamp) ? timestamp : fallback).toISOString();
}

function version(value) {
  return value ? ` ${String(value).split(/[._]/u)[0]}` : '';
}

export function describeUserAgent(value) {
  const userAgent = cleanText(value, 500);
  const edge = /Edg(?:A|iOS)?\/([\d.]+)/iu.exec(userAgent);
  const chrome = /(?:Chrome|CriOS)\/([\d.]+)/iu.exec(userAgent);
  const firefox = /(?:Firefox|FxiOS)\/([\d.]+)/iu.exec(userAgent);
  const safari = /Version\/([\d.]+).*Safari/iu.exec(userAgent);
  const browser = edge
    ? `Edge${version(edge[1])}`
    : chrome
      ? `Chrome${version(chrome[1])}`
      : firefox
        ? `Firefox${version(firefox[1])}`
        : safari
          ? `Safari${version(safari[1])}`
          : 'Unknown browser';

  let os = 'Unknown device';
  let mobile = false;
  if (/iPhone/iu.test(userAgent)) {
    os = 'iPhone';
    mobile = true;
  } else if (/iPad/iu.test(userAgent)) {
    os = 'iPad';
    mobile = true;
  } else if (/Android/iu.test(userAgent)) {
    os = /Mobile/iu.test(userAgent) ? 'Android phone' : 'Android tablet';
    mobile = true;
  } else if (/Windows NT/iu.test(userAgent)) os = 'Windows';
  else if (/Macintosh|Mac OS X/iu.test(userAgent)) os = 'macOS';
  else if (/CrOS/iu.test(userAgent)) os = 'ChromeOS';
  else if (/Linux/iu.test(userAgent)) os = 'Linux';

  return { device: `${os} · ${browser}`, os, browser, mobile };
}

export function sessionDetailsFromRequest(request, authMethod = 'legacy') {
  return {
    ...describeUserAgent(request?.get?.('user-agent')),
    locale: cleanText(request?.get?.('accept-language')?.split(',', 1)[0], 24),
    authMethod: ['google', 'access_id'].includes(authMethod) ? authMethod : 'legacy',
  };
}

function normalizeRecord(record) {
  if (!record?.id || !record?.userId) return null;
  const createdAt = iso(record.createdAt);
  if (record.kind === 'login-limit')
    return {
      id: cleanText(record.id, 120),
      userId: '__smena_rate_limit__',
      kind: 'login-limit',
      count: Math.max(0, Number(record.count) || 0),
      createdAt,
      lastSeenAt: iso(record.lastSeenAt, new Date(createdAt).getTime()),
      expiresAt: iso(record.expiresAt, new Date(createdAt).getTime()),
    };
  return {
    id: cleanText(record.id, 120),
    userId: cleanText(record.userId, 160),
    device: cleanText(record.device) || 'Unknown device · Unknown browser',
    os: cleanText(record.os) || 'Unknown device',
    browser: cleanText(record.browser) || 'Unknown browser',
    mobile: Boolean(record.mobile),
    locale: cleanText(record.locale, 24),
    authMethod: ['google', 'access_id'].includes(record.authMethod) ? record.authMethod : 'legacy',
    createdAt,
    lastSeenAt: iso(record.lastSeenAt, new Date(createdAt).getTime()),
    expiresAt: iso(record.expiresAt, new Date(createdAt).getTime()),
    ...(record.revokedAt ? { revokedAt: iso(record.revokedAt) } : {}),
  };
}

function activeRecords(records, now) {
  return (Array.isArray(records) ? records : [])
    .map(normalizeRecord)
    .filter(Boolean)
    .filter(record => new Date(record.expiresAt).getTime() > now)
    .sort((left, right) => String(right.lastSeenAt).localeCompare(String(left.lastSeenAt)));
}

function publicRecord(record, currentSessionId) {
  const safe = { ...record };
  delete safe.revokedAt;
  delete safe.userId;
  return { ...safe, current: record.id === currentSessionId };
}

function isWriteConflict(error) {
  return [409, 412].includes(Number(error?.code || error?.status || error?.response?.status));
}

export class AuthSessionRegistry {
  constructor(options = {}) {
    this.provider = options.provider || (() => getStorageProvider('default'));
    this.now = options.now || (() => Date.now());
    this.cacheDurationMs = options.cacheDurationMs ?? CACHE_DURATION_MS;
    this.touchIntervalMs = options.touchIntervalMs ?? TOUCH_INTERVAL_MS;
    this.cache = null;
    this.cacheAt = 0;
    this.queue = Promise.resolve();
  }

  async read(force = false) {
    const now = this.now();
    if (!force && this.cache && now - this.cacheAt < this.cacheDurationMs) return structuredClone(this.cache);
    const records = activeRecords(await this.provider().loadAuthSessions(), now);
    this.cache = records;
    this.cacheAt = now;
    return structuredClone(records);
  }

  mutate(change) {
    const run = async () => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const now = this.now();
        const stored = await this.provider().loadAuthSessions();
        const records = activeRecords(stored, now);
        const result = change(records, now);
        if (!result.changed) {
          this.cache = records;
          this.cacheAt = now;
          return result.value;
        }
        try {
          const next = activeRecords(result.records, now);
          await this.provider().saveAuthSessions(next, { expectedEtag: storageVersion(stored) });
          this.cache = next;
          this.cacheAt = now;
          return result.value;
        } catch (error) {
          if (!isWriteConflict(error) || attempt === 2) throw error;
        }
      }
      return null;
    };
    const pending = this.queue.then(run, run);
    this.queue = pending.catch(() => undefined);
    return pending;
  }

  register(details) {
    const candidate = normalizeRecord(details);
    if (!candidate || candidate.kind) throw new TypeError('Session details are invalid.');
    return this.mutate(records => {
      const existing = records.find(record => record.id === candidate.id);
      if (existing?.revokedAt) return { changed: false, records, value: null };
      if (!existing && records.filter(record => record.kind !== 'login-limit').length >= MAX_SESSION_RECORDS) {
        throw Object.assign(new Error('Too many active sessions. Sign out unused devices or wait for session expiry.'), {
          statusCode: 429,
          code: 'SESSION_LIMIT',
        });
      }
      const next = [candidate, ...records.filter(record => record.id !== candidate.id)];
      return { changed: true, records: next, value: publicRecord(candidate, candidate.id) };
    });
  }

  async ensure(details) {
    const candidate = normalizeRecord(details);
    if (!candidate || candidate.kind) return null;
    const cached = (await this.read(true)).find(record => record.kind !== 'login-limit' && record.id === candidate.id && record.userId === candidate.userId);
    // Only the sign-in endpoint can register a session. A missing record must
    // never resurrect an old, revoked or previously evicted signed token.
    if (!cached || cached.revokedAt) return null;
    if (cached && this.now() - new Date(cached.lastSeenAt).getTime() < this.touchIntervalMs) return publicRecord(cached, candidate.id);
    return this.mutate((records, now) => {
      const existing = records.find(record => record.id === candidate.id && record.userId === candidate.userId);
      if (!existing || existing.revokedAt) return { changed: false, records, value: null };
      const nextRecord = { ...existing, lastSeenAt: new Date(now).toISOString() };
      const next = [nextRecord, ...records.filter(record => record.id !== candidate.id)];
      return { changed: true, records: next, value: publicRecord(nextRecord, candidate.id) };
    });
  }

  async list(userId, currentSessionId) {
    return (await this.read(true))
      .filter(record => record.kind !== 'login-limit' && record.userId === userId && !record.revokedAt)
      .map(record => publicRecord(record, currentSessionId));
  }

  reserveLoginAttempt(key, options = {}) {
    const windowMs = options.windowMs || 15 * 60 * 1000;
    const maxAttempts = options.maxAttempts || 60;
    const id = `limit:${crypto
      .createHmac('sha256', options.secret || process.env.SESSION_SECRET || 'local-only-rate-limit')
      .update(String(key).slice(0, 200))
      .digest('hex')}`;
    return this.mutate((records, now) => {
      const record = records.find(item => item.kind === 'login-limit' && item.id === id);
      if (record?.count >= maxAttempts)
        return { changed: false, records, value: { allowed: false, retryAfterMs: Math.max(1, Date.parse(record.expiresAt) - now) } };
      if (!record && records.filter(item => item.kind === 'login-limit').length >= 1000)
        return { changed: false, records, value: { allowed: false, retryAfterMs: windowMs } };
      const next = record
        ? { ...record, count: record.count + 1, lastSeenAt: iso(now) }
        : { id, userId: '__smena_rate_limit__', kind: 'login-limit', count: 1, createdAt: iso(now), lastSeenAt: iso(now), expiresAt: iso(now + windowMs) };
      return { changed: true, records: [next, ...records.filter(item => item.id !== id)], value: { allowed: true, retryAfterMs: 0 } };
    });
  }

  revoke(userId, sessionId) {
    return this.mutate((records, now) => {
      const index = records.findIndex(record => record.kind !== 'login-limit' && record.id === sessionId && record.userId === userId && !record.revokedAt);
      if (index < 0) return { changed: false, records, value: false };
      const next = [...records];
      next[index] = { ...next[index], revokedAt: new Date(now).toISOString() };
      return { changed: true, records: next, value: true };
    });
  }

  revokeOthers(userId, currentSessionId) {
    return this.mutate((records, now) => {
      let revoked = 0;
      const next = records.map(record => {
        if (record.kind === 'login-limit' || record.userId !== userId || record.id === currentSessionId || record.revokedAt) return record;
        revoked += 1;
        return { ...record, revokedAt: new Date(now).toISOString() };
      });
      return { changed: revoked > 0, records: next, value: revoked };
    });
  }
}

const registry = new AuthSessionRegistry();

export const registerAuthSession = details => registry.register(details);
export const ensureAuthSession = details => registry.ensure(details);
export const listAuthSessions = (userId, currentSessionId) => registry.list(userId, currentSessionId);
export const revokeAuthSession = (userId, sessionId) => registry.revoke(userId, sessionId);
export const revokeOtherAuthSessions = (userId, currentSessionId) => registry.revokeOthers(userId, currentSessionId);
export const reserveSharedLoginAttempt = key => registry.reserveLoginAttempt(key);
