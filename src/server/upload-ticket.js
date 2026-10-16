import crypto from 'node:crypto';

const PREFIX = 'smena_upload_';
const LIFETIME_MS = 30 * 60 * 1000;

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
  const encoded = Buffer.from(JSON.stringify({ version: 1, ...payload, expiresAt: now + LIFETIME_MS })).toString('base64url');
  return `${PREFIX}${encoded}.${signature(encoded)}`;
}

export function verifyUploadTicket(ticket, now = Date.now()) {
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
  if (payload.version !== 1 || !Number.isFinite(payload.expiresAt) || payload.expiresAt <= now) {
    throw Object.assign(new Error('Upload ticket has expired.'), { statusCode: 400, code: 'UPLOAD_TICKET_EXPIRED' });
  }
  return payload;
}
