// The VPS backend binds to loopback. Its single local Nginx proxy must replace
// forwarded headers; do not trust arbitrary remote proxy chains or hop counts.
export function configureReverseProxy(app, env = process.env) {
  app.set('trust proxy', env.TRUST_PROXY === 'loopback' ? 'loopback' : false);
}

export function loginClientAddress(request, env = process.env) {
  if (env.VERCEL) return request.get('x-forwarded-for')?.split(',', 1)[0].trim() || request.socket.remoteAddress || 'unknown';
  return (env.TRUST_PROXY === 'loopback' && request.ip) || request.socket.remoteAddress || 'unknown';
}
