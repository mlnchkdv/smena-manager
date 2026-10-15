const SESSION_KEY = 'smena.session.v1';
let memorySessionToken = '';

export class ApiError extends Error {
  constructor(message, status = 0, code = 'API_ERROR', details = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    Object.assign(this, details);
  }
}

function readSessionToken() {
  try {
    return localStorage.getItem(SESSION_KEY) || memorySessionToken;
  } catch {
    return memorySessionToken;
  }
}

export function getSessionToken() {
  return readSessionToken();
}

export function setSessionToken(token) {
  memorySessionToken = token || '';
  try {
    if (token) localStorage.setItem(SESSION_KEY, token);
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* The in-memory token keeps the active tab working. */
  }
}

export function clearSession() {
  setSessionToken('');
}

async function request(path, options = {}, authenticated = false) {
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (authenticated) {
    const token = getSessionToken();
    if (!token) throw new ApiError('Authentication required.', 401, 'AUTH_REQUIRED');
    headers.set('Authorization', `Bearer ${token}`);
  }

  let response;
  try {
    response = await fetch(path, { ...options, headers });
  } catch (error) {
    throw new ApiError('The server is unavailable.', 0, 'NETWORK_ERROR', { cause: error });
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new ApiError(body.error || `Request failed (${response.status}).`, response.status, body.code || 'API_ERROR', body);
    if (response.status === 401 && authenticated) clearSession();
    throw error;
  }
  return body;
}

export const getAuthConfig = () => request('/api/auth/config');

export async function loginWithAccessId(accessId) {
  const result = await request('/api/auth/validate', {
    method: 'POST',
    body: JSON.stringify({ accessId }),
  });
  setSessionToken(result.token);
  return result.user;
}

export async function getCurrentUser() {
  const result = await request('/api/auth/me', {}, true);
  return result.user;
}

export async function getWorkspace() {
  const result = await request('/api/workspace', {}, true);
  return result.data;
}

export async function putWorkspace(data, revision) {
  const result = await request(
    '/api/workspace',
    {
      method: 'PUT',
      body: JSON.stringify({ data, revision }),
    },
    true,
  );
  return result.data;
}
