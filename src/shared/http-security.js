// GIS injects this button stylesheet into the parent page. Authorize only the
// observed stylesheet, not arbitrary inline CSS; re-audit if Google changes it.
export const GOOGLE_BUTTON_STYLE_HASH = "'sha256-RU4sU0AaS8IBGZx8XrGt/pa9A5SLA3dQszGeqT5L3Kw='";
// Cytoscape injects one fixed positioning rule when its canvas is created.
// Keep this exact hash in sync with the installed renderer, without permitting
// arbitrary inline styles or scripts.
export const CYTOSCAPE_STYLE_HASH = "'sha256-pgvDUBa4IjFA2yuSJ2cqcyxmNYJMborsd0ORcRv9vw8='";

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-src 'self' https://accounts.google.com",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "script-src 'self' https://accounts.google.com",
  `style-src 'self' https://fonts.googleapis.com https://accounts.google.com ${GOOGLE_BUTTON_STYLE_HASH} ${CYTOSCAPE_STYLE_HASH}`,
  `style-src-elem 'self' https://fonts.googleapis.com https://accounts.google.com ${GOOGLE_BUTTON_STYLE_HASH} ${CYTOSCAPE_STYLE_HASH}`,
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
