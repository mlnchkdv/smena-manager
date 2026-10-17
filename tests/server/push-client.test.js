import assert from 'node:assert/strict';
import test from 'node:test';
import { applicationServerKeyMatches, hasEnabledPushPreferences } from '../../src/shared/push-client.js';

test('push preference detection covers every supported delivery category', () => {
  assert.equal(hasEnabledPushPreferences({}), false);
  assert.equal(hasEnabledPushPreferences({ push_due: true }), true);
  assert.equal(hasEnabledPushPreferences({ push_comment: true }), true);
  assert.equal(hasEnabledPushPreferences({ push_security: true }), true);
});

test('existing browser subscriptions are replaced only when the VAPID key changed', () => {
  globalThis.atob ||= value => Buffer.from(value, 'base64').toString('binary');
  const key = Buffer.from([1, 2, 3, 4]).toString('base64url');
  const same = { options: { applicationServerKey: Uint8Array.from([1, 2, 3, 4]).buffer } };
  const changed = { options: { applicationServerKey: Uint8Array.from([1, 2, 3, 5]).buffer } };
  assert.equal(applicationServerKeyMatches(same, key), true);
  assert.equal(applicationServerKeyMatches(changed, key), false);
});
