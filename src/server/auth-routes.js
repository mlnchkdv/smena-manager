import { Router } from 'express';
import { accessIdLoginEnabled, createTrackedSession, findProfileByAccessId, getAccessProfiles, publicProfile, requireAuth, verifySession } from './auth.js';
import { setSessionCookie } from './session-cookie.js';
import { authenticateGoogleCredential, getGoogleAuthConfiguration, GoogleAuthenticationError } from './google-auth.js';
import { hasGoogleDriveCredentials } from './storage/index.js';
import { inspectDeploymentConfig, workspaceWritesEnabled } from './deployment-config.js';
import { createLoginRateLimiter } from './login-rate-limit.js';
import { getWorkspaceDatabase } from './workspace-store.js';
import { mergeAccessProfiles } from '../shared/workspace-access.js';
import { reserveSharedLoginAttempt } from './auth-session-store.js';

const loginRateLimiter = createLoginRateLimiter();

function rateLimitKey(request) {
  const forwarded = process.env.VERCEL ? request.get('x-forwarded-for')?.split(',', 1)[0].trim() : '';
  return forwarded || request.socket.remoteAddress || request.ip || 'unknown';
}

async function rateLimit(request, response, next) {
  try {
    const key = rateLimitKey(request);
    const result = process.env.VERCEL ? await reserveSharedLoginAttempt(key) : loginRateLimiter.check(key);
    if (!result.allowed) {
      response.setHeader('Retry-After', String(Math.ceil(result.retryAfterMs / 1000)));
      response.status(429).json({ error: 'Too many login attempts. Try again later.', code: 'LOGIN_RATE_LIMITED' });
      return;
    }
    request.loginRateLimitKey = key;
    next();
  } catch (error) {
    next(error);
  }
}

function requireAccessIdLogin(_request, response, next) {
  if (!accessIdLoginEnabled()) {
    response.status(404).json({
      valid: false,
      error: 'Access ID sign-in is disabled. Use Google.',
      code: 'ACCESS_ID_DISABLED',
    });
    return;
  }
  next();
}

export const authRouter = Router();

authRouter.post('/cookie', requireAuth, (request, response) => {
  const token = String(request.get('authorization') || '').replace(/^Bearer\s+/iu, '');
  const verified = verifySession(token);
  if (!verified.profile) return response.status(401).json({ error: 'Invalid session.' });
  setSessionCookie(response, token, verified.expiresAt);
  response.json({ user: request.user });
});

authRouter.get('/config', async (request, response) => {
  let profiles = [];
  let profileCount = 0;
  let configuredProfiles = [];
  let configurationError = null;
  let workspaceStorageAvailable = false;
  try {
    configuredProfiles = getAccessProfiles().filter(profile => profile.active);
    const database = await getWorkspaceDatabase().catch(() => null);
    workspaceStorageAvailable = Boolean(database);
    profiles = mergeAccessProfiles(configuredProfiles, database).filter(profile => profile.active);
    profileCount = configuredProfiles.length;
  } catch (error) {
    configurationError = error.message;
  }
  const deployment = process.env.VERCEL ? inspectDeploymentConfig({ profiles: configuredProfiles, profileError: configurationError }) : null;
  const issues = deployment?.issues.map(issue => issue.key) || (profileCount ? [] : [configurationError ? 'ACCESS_IDS_INVALID' : 'ACCESS_IDS']);
  const google = getGoogleAuthConfiguration({ profiles, hostname: request.hostname });
  response.json({
    accessIdEnabled: profileCount > 0 && accessIdLoginEnabled(),
    googleClientId: google.clientId,
    googleAuthEnabled: google.enabled,
    deploymentReady: issues.length === 0,
    configurationIssues: issues,
    configurationWarnings: deployment?.warnings.map(warning => warning.key) || [],
    googleCredentialMode: deployment?.credentialMode || (hasGoogleDriveCredentials() ? 'configured' : null),
    workspaceWritesEnabled: workspaceWritesEnabled(),
    workspaceStorageAvailable,
  });
});

authRouter.post('/google', rateLimit, async (request, response) => {
  try {
    const profiles = mergeAccessProfiles(getAccessProfiles(), await getWorkspaceDatabase());
    const profile = await authenticateGoogleCredential(request.body?.credential, { profiles });
    loginRateLimiter.recordSuccess(request.loginRateLimitKey);
    const token = await createTrackedSession(profile, request, 'google');
    setSessionCookie(response, token, verifySession(token).expiresAt);
    response.json({ valid: true, token, user: publicProfile(profile) });
  } catch (error) {
    loginRateLimiter.recordFailure(request.loginRateLimitKey);
    if (error instanceof GoogleAuthenticationError) {
      response.status(error.status).json({ valid: false, error: error.message, code: error.code });
      return;
    }
    response.status(500).json({ valid: false, error: 'Google authentication failed.', code: 'GOOGLE_AUTH_FAILED' });
  }
});

authRouter.post('/validate', requireAccessIdLogin, rateLimit, async (request, response, next) => {
  try {
    const accessId = typeof request.body?.accessId === 'string' ? request.body.accessId.trim() : '';
    const profile = findProfileByAccessId(accessId);
    if (!profile) {
      loginRateLimiter.recordFailure(request.loginRateLimitKey);
      response.status(401).json({ valid: false, error: 'Invalid access ID.' });
      return;
    }
    loginRateLimiter.recordSuccess(request.loginRateLimitKey);
    const token = await createTrackedSession(profile, request, 'access_id');
    setSessionCookie(response, token, verifySession(token).expiresAt);
    response.json({ valid: true, token, user: publicProfile(profile) });
  } catch (error) {
    next(error);
  }
});
