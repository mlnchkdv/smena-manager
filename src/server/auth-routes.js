import { Router } from 'express';
import { createSession, findProfileByAccessId, getAccessProfiles, publicProfile } from './auth.js';
import { authenticateGoogleCredential, getGoogleAuthConfiguration, GoogleAuthenticationError } from './google-auth.js';
import { hasGoogleDriveCredentials } from './storage/index.js';
import { inspectDeploymentConfig, workspaceWritesEnabled } from './deployment-config.js';
import { createLoginRateLimiter } from './login-rate-limit.js';
import { getWorkspaceDatabase } from './workspace-store.js';
import { mergeAccessProfiles } from '../shared/workspace-access.js';

const loginRateLimiter = createLoginRateLimiter();

function rateLimitKey(request) {
  const forwarded = process.env.VERCEL ? request.get('x-forwarded-for')?.split(',', 1)[0].trim() : '';
  return forwarded || request.socket.remoteAddress || request.ip || 'unknown';
}

function rateLimit(request, response, next) {
  const key = rateLimitKey(request);
  const result = loginRateLimiter.check(key);
  if (!result.allowed) {
    response.setHeader('Retry-After', String(Math.ceil(result.retryAfterMs / 1000)));
    response.status(429).json({ error: 'Too many login attempts. Try again later.', code: 'LOGIN_RATE_LIMITED' });
    return;
  }
  request.loginRateLimitKey = key;
  next();
}

export const authRouter = Router();

authRouter.get('/config', async (request, response) => {
  let profiles = [];
  let profileCount = 0;
  let configuredProfiles = [];
  let configurationError = null;
  try {
    configuredProfiles = getAccessProfiles().filter(profile => profile.active);
    const database = await getWorkspaceDatabase().catch(() => null);
    profiles = mergeAccessProfiles(configuredProfiles, database).filter(profile => profile.active);
    profileCount = configuredProfiles.length;
  } catch (error) {
    configurationError = error.message;
  }
  const deployment = process.env.VERCEL ? inspectDeploymentConfig({ profiles: configuredProfiles, profileError: configurationError }) : null;
  const issues = deployment?.issues.map(issue => issue.key) || (profileCount ? [] : [configurationError ? 'ACCESS_IDS_INVALID' : 'ACCESS_IDS']);
  const google = getGoogleAuthConfiguration({ profiles, hostname: request.hostname });
  response.json({
    accessIdEnabled: profileCount > 0,
    googleClientId: google.clientId,
    googleAuthEnabled: google.enabled,
    deploymentReady: issues.length === 0,
    configurationIssues: issues,
    configurationWarnings: deployment?.warnings.map(warning => warning.key) || [],
    googleCredentialMode: deployment?.credentialMode || (hasGoogleDriveCredentials() ? 'configured' : null),
    workspaceWritesEnabled: workspaceWritesEnabled(),
  });
});

authRouter.post('/google', rateLimit, async (request, response) => {
  try {
    const profiles = mergeAccessProfiles(getAccessProfiles(), await getWorkspaceDatabase());
    const profile = await authenticateGoogleCredential(request.body?.credential, { profiles });
    loginRateLimiter.recordSuccess(request.loginRateLimitKey);
    response.json({ valid: true, token: createSession(profile), user: publicProfile(profile) });
  } catch (error) {
    loginRateLimiter.recordFailure(request.loginRateLimitKey);
    if (error instanceof GoogleAuthenticationError) {
      response.status(error.status).json({ valid: false, error: error.message, code: error.code });
      return;
    }
    response.status(500).json({ valid: false, error: 'Google authentication failed.', code: 'GOOGLE_AUTH_FAILED' });
  }
});

authRouter.post('/validate', rateLimit, (request, response) => {
  const accessId = typeof request.body?.accessId === 'string' ? request.body.accessId.trim() : '';
  const profile = findProfileByAccessId(accessId);
  if (!profile) {
    loginRateLimiter.recordFailure(request.loginRateLimitKey);
    response.status(401).json({ valid: false, error: 'Invalid access ID.' });
    return;
  }
  loginRateLimiter.recordSuccess(request.loginRateLimitKey);
  response.json({ valid: true, token: createSession(profile), user: publicProfile(profile) });
});
