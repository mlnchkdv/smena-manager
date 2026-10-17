export const PUSH_PREFERENCE_KEYS = ['push_mention', 'push_assign', 'push_comment', 'push_due', 'push_security'];

export function decodeApplicationServerKey(value, decode = globalThis.atob) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = decode(base64);
  return Uint8Array.from(raw, character => character.charCodeAt(0));
}

export function hasEnabledPushPreferences(preferences) {
  return PUSH_PREFERENCE_KEYS.some(key => preferences?.[key] === true);
}

export function applicationServerKeyMatches(subscription, publicKey) {
  const current = subscription?.options?.applicationServerKey;
  if (!current) return true;
  const expected = decodeApplicationServerKey(publicKey);
  const actual = new Uint8Array(current);
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}
