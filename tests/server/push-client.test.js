import assert from 'node:assert/strict';
import test from 'node:test';
import { applicationServerKeyMatches, hasEnabledPushPreferences, pushDeviceState } from '../../src/shared/push-client.js';

test('push preference detection covers every supported delivery category', () => {
  assert.equal(hasEnabledPushPreferences({}), false);
  assert.equal(hasEnabledPushPreferences({ push_due: true }), true);
  assert.equal(hasEnabledPushPreferences({ push_comment: true }), true);
  assert.equal(hasEnabledPushPreferences({ push_security: true }), true);
});

test('device permission and platform support take precedence over a stale connection state', () => {
  assert.equal(pushDeviceState('default', 'ready'), 'default');
  assert.equal(pushDeviceState('denied', 'ready'), 'denied');
  assert.equal(pushDeviceState('granted', 'ready'), 'ready');
  assert.equal(pushDeviceState('granted', undefined), 'granted');
  assert.equal(pushDeviceState('granted', 'checking'), 'checking');
  assert.equal(pushDeviceState('granted', 'ready', false), 'unsupported');
});

test('existing browser subscriptions are replaced only when the VAPID key changed', () => {
  globalThis.atob ||= value => Buffer.from(value, 'base64').toString('binary');
  const key = Buffer.from([1, 2, 3, 4]).toString('base64url');
  const same = { options: { applicationServerKey: Uint8Array.from([1, 2, 3, 4]).buffer } };
  const changed = { options: { applicationServerKey: Uint8Array.from([1, 2, 3, 5]).buffer } };
  assert.equal(applicationServerKeyMatches(same, key), true);
  assert.equal(applicationServerKeyMatches(changed, key), false);
});
