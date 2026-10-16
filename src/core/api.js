import { WORKSPACE_TRANSPORT_MAX_BYTES, workspaceTransportBytes } from '../shared/workspace-size.js';

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

export async function loginWithGoogle(credential) {
  const result = await request('/api/auth/google', {
    method: 'POST',
    body: JSON.stringify({ credential }),
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
  const actualBytes = workspaceTransportBytes(data, revision);
  if (actualBytes > WORKSPACE_TRANSPORT_MAX_BYTES) {
    throw new ApiError('Workspace data exceeds the 4 MB synchronization limit.', 413, 'WORKSPACE_TOO_LARGE', {
      maxBytes: WORKSPACE_TRANSPORT_MAX_BYTES,
      actualBytes,
    });
  }
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

export async function deleteAllWorkspaces(revision) {
  const result = await request(
    '/api/workspace',
    {
      method: 'DELETE',
      body: JSON.stringify({ revision }),
    },
    true,
  );
  return result.data;
}

export async function getFileUploadPolicy() {
  return request('/api/files/policy', {}, true);
}

export function uploadWorkspaceFile(file, metadata, onProgress) {
  return new Promise((resolve, reject) => {
    const token = getSessionToken();
    if (!token) {
      reject(new ApiError('Authentication required.', 401, 'AUTH_REQUIRED'));
      return;
    }
    const form = new FormData();
    form.append('file', file);
    form.append('revision', String(metadata.revision));
    form.append('project', metadata.project || '');
    if (metadata.task) form.append('task', metadata.task);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/files/upload');
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.responseType = 'json';
    xhr.upload.onprogress = event => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onerror = () => reject(new ApiError('The server is unavailable.', 0, 'NETWORK_ERROR'));
    xhr.onabort = () => reject(new ApiError('Upload cancelled.', 0, 'UPLOAD_CANCELLED'));
    xhr.onload = () => {
      const body = xhr.response || {};
      if (xhr.status >= 200 && xhr.status < 300) resolve(body);
      else {
        if (xhr.status === 401) clearSession();
        reject(new ApiError(body.error || `Upload failed (${xhr.status}).`, xhr.status, body.code || 'UPLOAD_FAILED', body));
      }
    };
    xhr.send(form);
  });
}

export async function downloadWorkspaceFile(id, download = false) {
  const token = getSessionToken();
  if (!token) throw new ApiError('Authentication required.', 401, 'AUTH_REQUIRED');
  let response;
  try {
    response = await fetch(`/api/files/${encodeURIComponent(id)}/content${download ? '?download=1' : ''}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (error) {
    throw new ApiError('The server is unavailable.', 0, 'NETWORK_ERROR', { cause: error });
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(body.error || 'Unable to open the file.', response.status, body.code || 'FILE_ERROR', body);
  }
  return { blob: await response.blob(), disposition: response.headers.get('content-disposition') || '' };
}

export async function deleteWorkspaceFile(id, revision) {
  return request(
    `/api/files/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
      body: JSON.stringify({ revision }),
    },
    true,
  );
}

export async function getWorkspaceBackups() {
  const result = await request('/api/backups', {}, true);
  return result.backups || [];
}

export async function createWorkspaceBackup(label = '') {
  const result = await request('/api/backups', { method: 'POST', body: JSON.stringify({ label }) }, true);
  return result.backup;
}

export async function restoreWorkspaceBackup(id, revision) {
  const result = await request(`/api/backups/${encodeURIComponent(id)}/restore`, { method: 'POST', body: JSON.stringify({ revision }) }, true);
  return result.data;
}

export async function purgeWorkspaceTrash(id, revision) {
  const result = await request(`/api/trash/${encodeURIComponent(id)}`, { method: 'DELETE', body: JSON.stringify({ revision }) }, true);
  return result;
}
