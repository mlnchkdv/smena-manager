import { Router } from 'express';
import { createSession, findProfileByAccessId, getAccessProfiles, publicProfile } from './auth.js';
import { hasGoogleDriveCredentials } from './storage/index.js';
import { hasSharedRedis } from './redis.js';

const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 20;

function rateLimit(request, response, next) {
  const key = request.ip || request.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const record = attempts.get(key);
  if (!record || record.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    next();
    return;
  }
  if (record.count >= MAX_ATTEMPTS) {
    response.status(429).json({ error: 'Too many login attempts. Try again later.' });
    return;
  }
  record.count += 1;
  next();
}

export const authRouter = Router();

authRouter.get('/config', (_request, response) => {
  let profileCount = 0;
  let configurationError = null;
  try {
    profileCount = getAccessProfiles().length;
  } catch {
    configurationError = 'ACCESS_IDS_INVALID';
  }
  const issues = [];
  if (!process.env.SESSION_SECRET && process.env.VERCEL) issues.push('SESSION_SECRET');
  if (!profileCount) issues.push(configurationError || 'ACCESS_IDS');
  if (!hasGoogleDriveCredentials() && process.env.VERCEL) issues.push('GOOGLE_DRIVE_CREDENTIALS');
  if (!hasSharedRedis() && process.env.VERCEL) issues.push('REDIS_URL');
  response.json({
    accessIdEnabled: profileCount > 0,
    googleAuthEnabled: false,
    deploymentReady: issues.length === 0,
    configurationIssues: issues,
    workspaceWritesEnabled: !process.env.VERCEL || hasSharedRedis(),
  });
});

authRouter.post('/validate', rateLimit, (request, response) => {
  const accessId = typeof request.body?.accessId === 'string' ? request.body.accessId.trim() : '';
  const profile = findProfileByAccessId(accessId);
  if (!profile) {
    response.status(401).json({ valid: false, error: 'Invalid access ID.' });
    return;
  }
  response.json({ valid: true, token: createSession(profile), user: publicProfile(profile) });
});
