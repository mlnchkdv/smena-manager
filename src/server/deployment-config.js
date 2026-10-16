function value(env, key) {
  return String(env[key] || '').trim();
}

function serviceAccountMode(env) {
  if (value(env, 'GOOGLE_SERVICE_ACCOUNT_EMAIL') && value(env, 'GOOGLE_PRIVATE_KEY')) return true;
  const raw = value(env, 'GOOGLE_SERVICE_ACCOUNT_KEY');
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw);
    return Boolean(parsed.client_email && parsed.private_key);
  } catch {
    return false;
  }
}

export function googleCredentialMode(env = process.env) {
  const oauth = value(env, 'GOOGLE_CLIENT_ID') && value(env, 'GOOGLE_CLIENT_SECRET') && value(env, 'GOOGLE_REFRESH_TOKEN');
  if (oauth) return 'oauth2';
  if (serviceAccountMode(env)) return 'service-account';
  return null;
}

export function directDriveWritesEnabled(env = process.env) {
  return value(env, 'WORKSPACE_WRITE_MODE').toLowerCase() === 'drive';
}

export function workspaceWritesEnabled(env = process.env) {
  return !value(env, 'VERCEL') || Boolean(value(env, 'REDIS_URL')) || (directDriveWritesEnabled(env) && Boolean(googleCredentialMode(env)));
}

export function inspectDeploymentConfig(options = {}) {
  const env = options.env || process.env;
  const profiles = options.profiles || [];
  const issues = [];
  const warnings = [];
  const secret = value(env, 'SESSION_SECRET');
  const credentialMode = googleCredentialMode(env);

  if (secret.length < 32) issues.push({ key: 'SESSION_SECRET', message: 'Use a random value with at least 32 characters.' });
  if (options.profileError) issues.push({ key: 'ACCESS_IDS_INVALID', message: options.profileError });
  else if (!profiles.length) issues.push({ key: 'ACCESS_IDS', message: 'Configure at least one active access profile.' });
  else {
    const duplicateIds = profiles.filter((profile, index) => profiles.findIndex(item => item.id === profile.id) !== index);
    const duplicateAccessIds = profiles.filter((profile, index) => profiles.findIndex(item => item.accessId === profile.accessId) !== index);
    if (duplicateIds.length) issues.push({ key: 'ACCESS_ID_DUPLICATE_USER', message: 'Profile IDs must be unique.' });
    if (duplicateAccessIds.length) issues.push({ key: 'ACCESS_ID_DUPLICATE_SECRET', message: 'Access IDs must be unique.' });
    if (profiles.some(profile => profile.accessId.length < 16)) {
      issues.push({ key: 'ACCESS_ID_WEAK', message: 'Every Access ID must contain at least 16 characters.' });
    }
    if (!profiles.some(profile => profile.role === 'admin')) issues.push({ key: 'ACCESS_ID_ADMIN', message: 'At least one active administrator is required.' });
  }
  if (!credentialMode) issues.push({ key: 'GOOGLE_DRIVE_CREDENTIALS', message: 'Configure a complete OAuth2 or service-account credential set.' });
  if (credentialMode === 'service-account' && !value(env, 'GOOGLE_DRIVE_FOLDER_ID')) {
    issues.push({ key: 'GOOGLE_DRIVE_FOLDER_ID', message: 'A shared Drive folder is required for a service account.' });
  }
  if (!value(env, 'REDIS_URL') && !directDriveWritesEnabled(env)) {
    issues.push({ key: 'WORKSPACE_WRITE_MODE', message: 'Configure Redis or explicitly enable direct Google Drive writes.' });
  } else if (!value(env, 'REDIS_URL')) {
    warnings.push({ key: 'DRIVE_WRITE_CONCURRENCY', message: 'Direct Drive writes use revision and ETag conflict protection instead of a shared lock.' });
  }
  if (!value(env, 'GOOGLE_DRIVE_DATABASE_FILE_ID')) {
    warnings.push({ key: 'GOOGLE_DRIVE_DATABASE_FILE_ID', message: 'Optional: set the created database file ID to reduce Drive lookup requests.' });
  }
  if (!value(env, 'GOOGLE_DRIVE_UPLOADS_FOLDER_ID')) {
    warnings.push({ key: 'GOOGLE_DRIVE_UPLOADS_FOLDER_ID', message: 'Optional: set the created uploads folder ID to reduce Drive lookup requests.' });
  }
  if (value(env, 'EMAIL_FROM') && !value(env, 'GMAIL_OAUTH_REFRESH_TOKEN')) {
    warnings.push({
      key: 'GMAIL_OAUTH_REFRESH_TOKEN',
      message: 'Authorize a dedicated Gmail refresh token so email delivery does not depend on the Google Drive token.',
    });
  }

  return {
    ready: issues.length === 0,
    credentialMode,
    profileCount: profiles.length,
    issues,
    warnings,
  };
}
