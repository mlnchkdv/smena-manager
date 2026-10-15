import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const SESSION_PREFIX = 'smena_sess_';
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const ephemeralSecret = crypto.randomBytes(32).toString('hex');
const validRoles = new Set(['admin', 'editor', 'viewer']);

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
    sessionId: crypto.randomUUID(),
    userId: profile.id,
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
  if (!profile) return { error: 'Account is unavailable.' };
  return { profile, sessionId: payload.sessionId, expiresAt: payload.expiresAt };
}

function requestToken(request) {
  const authorization = request.get('authorization') || '';
  if (authorization.toLowerCase().startsWith('bearer ')) return authorization.slice(7).trim();
  return String(request.get('x-session-token') || '').trim();
}

export function requireAuth(request, response, next) {
  const result = verifySession(requestToken(request));
  if (!result.profile) {
    response.status(401).json({ error: result.error || 'Authentication required.' });
    return;
  }
  request.user = safeProfile(result.profile);
  request.sessionId = result.sessionId;
  next();
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
