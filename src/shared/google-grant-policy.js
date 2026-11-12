// Configuration diagnosis only: a declared publishing status is not a Google
// Console verification. No secret or credential fingerprint leaves this helper.
export function googleGrantPolicy(env = {}) {
  const value = key => String(env[key] || '').trim();
  const gmailConfigured = Boolean(value('GMAIL_OAUTH_REFRESH_TOKEN') || (value('EMAIL_FROM') && value('GOOGLE_REFRESH_TOKEN')));
  const gmailIsolated = Boolean(
    value('GMAIL_OAUTH_REFRESH_TOKEN') &&
    value('GMAIL_OAUTH_REFRESH_TOKEN') !== value('GOOGLE_REFRESH_TOKEN') &&
    value('GMAIL_OAUTH_CLIENT_ID') &&
    value('GMAIL_OAUTH_CLIENT_ID') !== value('GOOGLE_CLIENT_ID') &&
    value('GMAIL_OAUTH_CLIENT_SECRET'),
  );
  const declared = value('GOOGLE_OAUTH_PUBLISHING_STATUS').toLowerCase();
  return {
    gmailConfigured,
    gmailIsolated,
    publishingStatus: ['production', 'testing', 'internal'].includes(declared) ? declared : 'unknown',
    requireIsolation: value('GMAIL_REQUIRE_ISOLATED_GRANT') === 'true',
  };
}
