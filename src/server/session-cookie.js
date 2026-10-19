export const SESSION_COOKIE = 'smena_session';

export function sessionCookieToken(request) {
  const cookies = String(request.get('cookie') || '').split(';');
  const entry = cookies.map(item => item.trim()).find(item => item.startsWith(`${SESSION_COOKIE}=`));
  return entry?.slice(SESSION_COOKIE.length + 1) || '';
}

export function setSessionCookie(response, token, expiresAt = Date.now() + 7 * 86400000) {
  const secure = Boolean(process.env.VERCEL) || process.env.NODE_ENV === 'production';
  const maxAge = token ? Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)) : 0;
  const expires = new Date(expiresAt).toUTCString();
  response.append('Set-Cookie', `${SESSION_COOKIE}=${token || ''}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}; Expires=${expires}${secure ? '; Secure' : ''}`);
}
