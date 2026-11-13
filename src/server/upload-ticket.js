import crypto from 'node:crypto';
import { workspaceScope } from './workspace-context.js';

const PREFIX = 'smena_upload_';
const LIFETIME_MS = 24 * 60 * 60 * 1000;
const RECOVERY_MS = 7 * LIFETIME_MS;

function secret() {
  const value = process.env.SESSION_SECRET?.trim();
  if (!value) throw new Error('SESSION_SECRET is required to sign upload tickets.');
  return value;
}

function signature(value) {
  return crypto.createHmac('sha256', secret()).update(value).digest('base64url');
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function createUploadTicket(payload, now = Date.now()) {
  const renewUntil = payload.renewUntil ?? now + RECOVERY_MS;
  const encoded = Buffer.from(
    JSON.stringify({ version: 1, ...payload, workspace: workspaceScope(), renewUntil, expiresAt: Math.min(now + LIFETIME_MS, renewUntil) }),
  ).toString('base64url');
  return `${PREFIX}${encoded}.${signature(encoded)}`;
}

export function verifyUploadTicket(ticket, now = Date.now(), { allowRenewal = false } = {}) {
  if (!ticket?.startsWith(PREFIX)) throw Object.assign(new Error('Upload ticket is invalid.'), { statusCode: 400, code: 'UPLOAD_TICKET_INVALID' });
  const signed = ticket.slice(PREFIX.length);
  const separator = signed.lastIndexOf('.');
  const encoded = signed.slice(0, separator);
  const received = signed.slice(separator + 1);
  if (separator < 1 || !safeEqual(received, signature(encoded))) {
    throw Object.assign(new Error('Upload ticket is invalid.'), { statusCode: 400, code: 'UPLOAD_TICKET_INVALID' });
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    throw Object.assign(new Error('Upload ticket is invalid.'), { statusCode: 400, code: 'UPLOAD_TICKET_INVALID' });
  }
  // Old tickets had a 24-hour expiry but no explicit recovery deadline.
  const renewUntil = payload.renewUntil ?? payload.expiresAt + RECOVERY_MS - LIFETIME_MS;
  if (
    payload.version !== 1 ||
    !Number.isFinite(payload.expiresAt) ||
    !Number.isFinite(renewUntil) ||
    renewUntil <= now ||
    (!allowRenewal && payload.expiresAt <= now)
  ) {
    throw Object.assign(new Error('Upload ticket has expired.'), { statusCode: 400, code: 'UPLOAD_TICKET_EXPIRED' });
  }
  if ((payload.workspace || 'default') !== workspaceScope())
    throw Object.assign(new Error('This upload belongs to another workspace.'), { statusCode: 403, code: 'FILE_FORBIDDEN' });
  return payload;
}

export function renewUploadTicket(payload, now = Date.now()) {
  return createUploadTicket({ ...payload, renewUntil: payload.renewUntil ?? payload.expiresAt + RECOVERY_MS - LIFETIME_MS }, now);
}
