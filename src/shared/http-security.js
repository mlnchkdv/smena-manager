export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  'frame-src https://accounts.google.com',
  "frame-ancestors 'self'",
  "form-action 'self'",
  "script-src 'self' https://accounts.google.com",
  "style-src 'self' https://fonts.googleapis.com https://accounts.google.com",
  "style-src-elem 'self' https://fonts.googleapis.com https://accounts.google.com",
  "style-src-attr 'unsafe-inline'",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "connect-src 'self' https://accounts.google.com https://www.googleapis.com",
  "manifest-src 'self'",
].join('; ');

export const HTTP_SECURITY_HEADERS = Object.freeze({
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
});
