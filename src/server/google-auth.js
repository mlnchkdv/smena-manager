import { OAuth2Client } from 'google-auth-library';
import { configureProviderTimeout } from './provider-safety.js';
import { findProfileByEmail, getAccessProfiles } from './auth.js';

export class GoogleAuthenticationError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = 'GoogleAuthenticationError';
    this.status = status;
    this.code = code;
  }
}

export function getGoogleAuthConfiguration(options = {}) {
  const env = options.env || process.env;
  const profiles = options.profiles || getAccessProfiles();
  const hostname = String(options.hostname || '').toLowerCase();
  const clientId = String(env.GOOGLE_CLIENT_ID || '').trim();
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  const originAllowed = !isLocalhost || env.GOOGLE_LOCALHOST_ENABLED === 'true';
  const hasEligibleProfile = profiles.some(profile => profile.active && profile.email);
  const hasSessionSecret = !env.VERCEL || String(env.SESSION_SECRET || '').trim().length >= 32;

  return {
    clientId,
    enabled: Boolean(clientId && originAllowed && hasEligibleProfile && hasSessionSecret),
    originAllowed,
    hasEligibleProfile,
  };
}

export async function authenticateGoogleCredential(credential, options = {}) {
  const env = options.env || process.env;
  const clientId = String(env.GOOGLE_CLIENT_ID || '').trim();
  if (!clientId) {
    throw new GoogleAuthenticationError('Google authentication is not configured.', 503, 'GOOGLE_NOT_CONFIGURED');
  }
  if (typeof credential !== 'string' || !credential.trim()) {
    throw new GoogleAuthenticationError('Google credential is required.', 400, 'GOOGLE_CREDENTIAL_REQUIRED');
  }

  let ticket;
  try {
    if (options.verifyIdToken) {
      ticket = await options.verifyIdToken({ idToken: credential.trim(), audience: clientId });
    } else {
      const client = configureProviderTimeout(new OAuth2Client(clientId));
      ticket = await client.verifyIdToken({ idToken: credential.trim(), audience: clientId });
    }
  } catch {
    throw new GoogleAuthenticationError('The Google token is invalid or expired.', 401, 'GOOGLE_TOKEN_INVALID');
  }

  const payload = typeof ticket?.getPayload === 'function' ? ticket.getPayload() : ticket;
  if (!payload?.email || payload.email_verified !== true) {
    throw new GoogleAuthenticationError('The Google account email is not verified.', 401, 'GOOGLE_EMAIL_UNVERIFIED');
  }

  const profiles = options.profiles || getAccessProfiles();
  const profile = findProfileByEmail(payload.email, profiles);
  if (!profile) {
    throw new GoogleAuthenticationError('This Google account does not have access to the workspace.', 403, 'GOOGLE_ACCESS_DENIED');
  }
  return profile;
}
