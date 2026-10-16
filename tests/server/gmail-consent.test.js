import assert from 'node:assert/strict';
import test from 'node:test';
import { GMAIL_SEND_SCOPE, gmailConsentConfig, gmailConsentUrl } from '../../scripts/setup-gmail-oauth.js';

test('Gmail consent reuses the Drive client without reusing its refresh token', () => {
  const config = gmailConsentConfig({
    GOOGLE_CLIENT_ID: 'drive-client.apps.googleusercontent.com',
    GOOGLE_CLIENT_SECRET: 'drive-secret',
    GOOGLE_REFRESH_TOKEN: 'must-not-be-read',
    EMAIL_FROM: 'Sender@Example.com',
  });
  assert.deepEqual(config, {
    clientId: 'drive-client.apps.googleusercontent.com',
    clientSecret: 'drive-secret',
    redirectUri: 'http://127.0.0.1:53682/oauth2/callback',
    sender: 'sender@example.com',
  });
});

test('Gmail consent URL requests offline minimal access and an explicit confirmation', () => {
  const config = gmailConsentConfig({
    GMAIL_OAUTH_CLIENT_ID: 'gmail-client.apps.googleusercontent.com',
    GMAIL_OAUTH_CLIENT_SECRET: 'gmail-secret',
    GMAIL_OAUTH_REDIRECT_URI: 'http://localhost:54321/oauth2/callback',
    EMAIL_FROM: 'sender@example.com',
  });
  const url = new URL(gmailConsentUrl(config, 'csrf-state'));
  assert.equal(url.origin, 'https://accounts.google.com');
  assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.equal(url.searchParams.get('prompt'), 'consent select_account');
  assert.equal(url.searchParams.get('state'), 'csrf-state');
  assert.equal(url.searchParams.get('redirect_uri'), config.redirectUri);
  assert.ok(url.searchParams.get('scope').includes(GMAIL_SEND_SCOPE));
  assert.ok(!url.searchParams.get('scope').includes('https://mail.google.com/'));
});
