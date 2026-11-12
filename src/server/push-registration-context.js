import { createHash } from 'node:crypto';

export function pushRegistrationContext(env = process.env, requestOrigin = '') {
  const raw = String(env.APP_ORIGIN || requestOrigin || '').trim();
  let origin = '';
  if (raw) {
    let url;
    try {
      url = new URL(raw);
    } catch {
      throw new TypeError('Invalid push origin.');
    }
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && env.NODE_ENV !== 'production';
    if (url.username || url.password || (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || raw.replace(/\/$/, '') !== url.origin)
      throw new TypeError('Invalid push origin.');
    origin = url.origin;
    if (env.APP_ORIGIN && requestOrigin && new URL(requestOrigin).origin !== origin)
      throw Object.assign(new Error('Push origin does not match this application.'), { statusCode: 403 });
  }
  const publicKey = String(env.VAPID_PUBLIC_KEY || '').trim();
  return { origin, vapidKeyId: publicKey ? createHash('sha256').update(publicKey).digest('base64url').slice(0, 24) : '' };
}

export function pushRegistrationMatches(record, context) {
  if (record.vapidKeyId && record.vapidKeyId !== context.vapidKeyId) return false;
  // A configured VPS origin fails closed for unbound legacy registrations. Keep
  // them for rollback/review, never guess their old VAPID key or delete them.
  if (context.origin && (record.origin !== context.origin || !record.vapidKeyId)) return false;
  return true;
}
