import crypto from 'node:crypto';
import { sessionCookieToken } from './session-cookie.js';
import { reportProviderError } from './provider-safety.js';
import fs from 'node:fs';
import path from 'node:path';
import { getWorkspaceDatabase } from './workspace-store.js';
import { workspaceAccessProfiles, workspaceMemberRole } from '../shared/workspace-access.js';
import { memberForProfile } from '../shared/member-identity.js';
import { ensureAuthSession, registerAuthSession, sessionDetailsFromRequest } from './auth-session-store.js';
import { recordLoginSecurityNotification } from './login-security.js';

const SESSION_PREFIX = 'smena_sess_';
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const ephemeralSecret = crypto.randomBytes(32).toString('hex');
const validRoles = new Set(['admin', 'editor', 'viewer']);

export function accessIdLoginEnabled(environment = process.env) {
  const configured = String(environment.ACCESS_ID_LOGIN_ENABLED || '')
    .trim()
    .toLowerCase();
  if (configured) return ['1', 'true', 'yes', 'on'].includes(configured);
  return !environment.VERCEL;
}

function sessionSecret() {
  const value = process.env.SESSION_SECRET?.trim();
  if (value) return value;
  if (process.env.VERCEL) throw new Error('SESSION_SECRET is required on Vercel.');
  return ephemeralSecret;
}

function normalizeProfile(profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return null;
  const id = String(profile.id || '').trim();
  const accessId = String(profile.accessId || '').trim();
  const role = String(profile.role || 'viewer')
    .trim()
    .toLowerCase();
  if (!id || !accessId || !validRoles.has(role)) return null;
  return {
    id,
    accessId,
    name: String(profile.name || id).trim(),
    email: String(profile.email || '')
      .trim()
      .toLowerCase(),
    title: String(profile.title || '').trim(),
    team: String(profile.team || '').trim(),
    role,
    active: profile.active !== false,
  };
}

export function getAccessProfiles() {
  const inline = process.env.ACCESS_IDS_JSON?.trim();
  let parsed;
  if (inline) {
    parsed = JSON.parse(inline);
  } else {
    const configuredPath = process.env.ACCESS_IDS_PATH?.trim();
    const profilePath = path.resolve(configuredPath || path.join(process.cwd(), '.data', 'access-ids.json'));
    if (!fs.existsSync(profilePath)) return [];
    parsed = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
  }
  if (!Array.isArray(parsed)) throw new Error('Access profiles must be a JSON array.');
  return parsed.map(normalizeProfile).filter(Boolean);
}

function safeProfile(profile) {
  return {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    title: profile.title,
    team: profile.team,
    role: profile.role,
    active: profile.active,
  };
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function findProfileByAccessId(accessId) {
  if (!accessId) return null;
  return getAccessProfiles().find(profile => profile.active && safeEqual(profile.accessId, accessId.trim())) || null;
}

export function findProfileByEmail(email, profiles = getAccessProfiles()) {
  const normalizedEmail = String(email || '')
    .trim()
    .toLowerCase();
  if (!normalizedEmail) return null;
  return profiles.find(profile => profile.active && profile.email === normalizedEmail) || null;
}

export function createSession(profile, options = {}) {
  const issuedAt = options.issuedAt || Date.now();
  const expiresAt = options.expiresAt || issuedAt + SESSION_DURATION_MS;
  const payload = JSON.stringify({
    version: 1,
    sessionId: options.sessionId || crypto.randomUUID(),
    userId: profile.id,
    profile: profile.source === 'workspace' ? safeProfile(profile) : undefined,
    issuedAt,
    expiresAt,
  });
  const encoded = Buffer.from(payload).toString('base64url');
  const signature = crypto.createHmac('sha256', sessionSecret()).update(encoded).digest('base64url');
  return `${SESSION_PREFIX}${encoded}.${signature}`;
}

export function verifySession(token) {
  if (!token?.startsWith(SESSION_PREFIX)) return { error: 'Invalid session.' };
  const signed = token.slice(SESSION_PREFIX.length);
  const separator = signed.lastIndexOf('.');
  if (separator < 1) return { error: 'Invalid session.' };
  const encoded = signed.slice(0, separator);
  const receivedSignature = signed.slice(separator + 1);
  const expectedSignature = crypto.createHmac('sha256', sessionSecret()).update(encoded).digest('base64url');
  if (!safeEqual(receivedSignature, expectedSignature)) return { error: 'Invalid session.' };

  let payload;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return { error: 'Invalid session.' };
  }
  if (payload.version !== 1 || !payload.userId || !Number.isFinite(payload.expiresAt)) {
    return { error: 'Invalid session.' };
  }
  if (payload.expiresAt <= Date.now()) return { error: 'Session expired.' };
  const profile = getAccessProfiles().find(item => item.id === payload.userId && item.active);
  if (profile) return { profile, sessionId: payload.sessionId, issuedAt: payload.issuedAt, expiresAt: payload.expiresAt, dynamic: false };
  const embedded = payload.profile;
  if (
    embedded?.id === payload.userId &&
    String(embedded.id).startsWith('workspace:') &&
    embedded.email &&
    validRoles.has(embedded.role) &&
    embedded.active !== false
  ) {
    return { profile: embedded, sessionId: payload.sessionId, issuedAt: payload.issuedAt, expiresAt: payload.expiresAt, dynamic: true };
  }
  return { error: 'Account is unavailable.' };
}

export async function createTrackedSession(profile, request, authMethod) {
  const token = createSession(profile);
  const verified = verifySession(token);
  const session = await registerAuthSession({
    id: verified.sessionId,
    userId: profile.id,
    createdAt: verified.issuedAt,
    lastSeenAt: verified.issuedAt,
    expiresAt: verified.expiresAt,
    ...sessionDetailsFromRequest(request, authMethod),
  });
  if (session) {
    await recordLoginSecurityNotification(profile, session).catch(error => {
      reportProviderError('[Security] Login notification failed', error);
    });
  }
  return token;
}

function requestToken(request) {
  const authorization = request.get('authorization') || '';
  if (authorization.toLowerCase().startsWith('bearer ') && authorization.slice(7).trim() !== 'cookie') return authorization.slice(7).trim();
  return String(request.get('x-session-token') || '').trim() || sessionCookieToken(request);
}

export async function requireAuth(request, response, next) {
  const result = verifySession(requestToken(request));
  if (!result.profile) {
    response.status(401).json({ error: result.error || 'Authentication required.' });
    return;
  }
  let expectedAccount;
  try {
    expectedAccount = request.get('X-Smena-Account') ? decodeURIComponent(request.get('X-Smena-Account')) : null;
  } catch {
    expectedAccount = '__invalid_account_header__';
  }
  if ((expectedAccount && expectedAccount !== result.profile.id) || (request.query?.account && request.query.account !== result.profile.id)) {
    response.status(409).json({ error: 'The account changed in another tab. Reload this page to continue.', code: 'SESSION_ACCOUNT_CHANGED' });
    return;
  }
  try {
    let profile = result.profile;
    const database = await getWorkspaceDatabase();
    if (result.dynamic) {
      const profiles = workspaceAccessProfiles(database);
      profile = profiles.find(item => item.id === result.profile.id && item.email === result.profile.email);
      if (!profile) {
        response.status(401).json({ error: 'Account is unavailable.' });
        return;
      }
    } else {
      const member = memberForProfile(database, result.profile);
      if (member && ['deactivated', 'removed'].includes(String(member.status || '').toLowerCase())) {
        response.status(401).json({ error: 'Account is deactivated.' });
        return;
      }
      if (member) profile = { ...profile, role: workspaceMemberRole(member), ...(member.profileEditedAt ? { name: member.name, title: member.title } : {}) };
    }
    const activeSession = await ensureAuthSession({
      id: result.sessionId,
      userId: profile.id,
      createdAt: result.issuedAt,
      lastSeenAt: Date.now(),
      expiresAt: result.expiresAt,
      ...sessionDetailsFromRequest(request),
    });
    if (!activeSession) {
      response.status(401).json({ error: 'Session has been signed out.', code: 'SESSION_REVOKED' });
      return;
    }
    request.user = safeProfile(profile);
    request.workspaceSnapshot = database;
    request.sessionId = result.sessionId;
    request.authSession = activeSession;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRole(...roles) {
  const allowed = new Set(roles);
  return (request, response, next) => {
    if (!request.user || !allowed.has(request.user.role)) {
      response.status(403).json({ error: 'Insufficient permissions.' });
      return;
    }
    next();
  };
}

export function publicProfile(profile) {
  return safeProfile(profile);
}
