import { Router } from 'express';
import { createSession, findProfileByAccessId, getAccessProfiles, publicProfile } from './auth.js';
import { hasGoogleDriveCredentials } from './storage/index.js';
import { hasSharedRedis } from './redis.js';
import { inspectDeploymentConfig } from './deployment-config.js';
import { createLoginRateLimiter } from './login-rate-limit.js';

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

authRouter.get('/config', (_request, response) => {
  let profiles = [];
  let profileCount = 0;
  let configurationError = null;
  try {
    profiles = getAccessProfiles().filter(profile => profile.active);
    profileCount = profiles.length;
  } catch (error) {
    configurationError = error.message;
  }
  const deployment = process.env.VERCEL ? inspectDeploymentConfig({ profiles, profileError: configurationError }) : null;
  const issues = deployment?.issues.map(issue => issue.key) || (profileCount ? [] : [configurationError ? 'ACCESS_IDS_INVALID' : 'ACCESS_IDS']);
  response.json({
    accessIdEnabled: profileCount > 0,
    googleAuthEnabled: false,
    deploymentReady: issues.length === 0,
    configurationIssues: issues,
    configurationWarnings: deployment?.warnings.map(warning => warning.key) || [],
    googleCredentialMode: deployment?.credentialMode || (hasGoogleDriveCredentials() ? 'configured' : null),
    workspaceWritesEnabled: !process.env.VERCEL || hasSharedRedis(),
  });
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
