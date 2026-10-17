import { WORKSPACE_TRANSPORT_MAX_BYTES, workspaceTransportBytes } from '../shared/workspace-size.js';
import { workspaceCoreData } from '../shared/workspace-documents.js';

export const SESSION_STORAGE_KEY = 'smena.session.v1';
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
    return localStorage.getItem(SESSION_STORAGE_KEY) || memorySessionToken;
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
    if (token) localStorage.setItem(SESSION_STORAGE_KEY, token);
    else localStorage.removeItem(SESSION_STORAGE_KEY);
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

export async function getAuthSessions() {
  const result = await request('/api/auth/sessions', {}, true);
  return result.sessions || [];
}

export async function revokeAuthSession(sessionId) {
  return request(`/api/auth/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' }, true);
}

export async function revokeOtherAuthSessions() {
  return request('/api/auth/sessions/others', { method: 'DELETE' }, true);
}

export async function revokeCurrentAuthSession() {
  return request('/api/auth/session', { method: 'DELETE' }, true);
}

export async function getWorkspace() {
  const result = await request('/api/workspace', {}, true);
  return result.data;
}

export async function getWorkspaceRevision() {
  return request('/api/workspace/revision', {}, true);
}

export async function getWorkspaceDocument(name) {
  const result = await request(`/api/workspace-documents/${encodeURIComponent(name)}`, {}, true);
  return result.data;
}

export async function putWorkspaceDocument(name, data, revision) {
  const actualBytes = workspaceTransportBytes(data, revision);
  if (actualBytes > WORKSPACE_TRANSPORT_MAX_BYTES) {
    throw new ApiError(`The ${name} document exceeds the 4 MB synchronization limit.`, 413, 'WORKSPACE_TOO_LARGE', {
      maxBytes: WORKSPACE_TRANSPORT_MAX_BYTES,
      actualBytes,
    });
  }
  const result = await request(`/api/workspace-documents/${encodeURIComponent(name)}`, { method: 'PUT', body: JSON.stringify({ data, revision }) }, true);
  return result.data;
}

export async function getStorageStatus() {
  return request('/api/storage/status', {}, true);
}

export async function getPushConfig() {
  return request('/api/push/config', {}, true);
}

export async function getNotificationDeliveryStatus() {
  return request('/api/notifications/delivery-status', {}, true);
}

export async function savePushSubscription(subscription, locale) {
  return request(
    '/api/push/subscriptions',
    {
      method: 'POST',
      body: JSON.stringify({ subscription, locale }),
    },
    true,
  );
}

export async function deletePushSubscription(endpoint) {
  return request(
    '/api/push/subscriptions',
    {
      method: 'DELETE',
      body: JSON.stringify({ endpoint }),
    },
    true,
  );
}

export async function clearReadNotifications(revision) {
  return request(
    '/api/notifications/read',
    {
      method: 'DELETE',
      body: JSON.stringify({ revision }),
    },
    true,
  );
}

export async function putWorkspace(data, revision) {
  const coreData = workspaceCoreData(data);
  const actualBytes = workspaceTransportBytes(coreData, revision);
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
      body: JSON.stringify({ data: coreData, revision }),
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

function uploadWorkspaceFileThroughApi(file, metadata, onProgress) {
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

function uploadDriveChunks(uploadUrl, file, chunkSizeBytes, onProgress) {
  return new Promise((resolve, reject) => {
    let start = 0;
    const sendNext = () => {
      const end = Math.min(start + chunkSizeBytes, file.size);
      const chunk = file.slice(start, end);
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', uploadUrl);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.setRequestHeader('Content-Range', `bytes ${start}-${end - 1}/${file.size}`);
      xhr.responseType = 'json';
      xhr.upload.onprogress = event => {
        if (event.lengthComputable) onProgress?.(Math.round(((start + event.loaded) / file.size) * 100));
      };
      xhr.onerror = () => reject(new ApiError('Google Drive is unavailable.', 0, 'DIRECT_UPLOAD_NETWORK_ERROR'));
      xhr.onabort = () => reject(new ApiError('Upload cancelled.', 0, 'UPLOAD_CANCELLED'));
      xhr.onload = () => {
        if (xhr.status === 308) {
          const accepted = /bytes=0-(\d+)/.exec(xhr.getResponseHeader('Range') || '');
          start = accepted ? Number(accepted[1]) + 1 : end;
          sendNext();
          return;
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress?.(100);
          resolve(xhr.response || {});
          return;
        }
        reject(new ApiError(`Google Drive rejected the upload (${xhr.status}).`, xhr.status, 'DIRECT_UPLOAD_FAILED'));
      };
      xhr.send(chunk);
    };
    sendNext();
  });
}

async function uploadWorkspaceFileDirect(file, metadata, onProgress) {
  const session = await request(
    '/api/files/upload-session',
    {
      method: 'POST',
      body: JSON.stringify({
        name: file.name,
        size: file.size,
        mimeType: file.type || 'application/octet-stream',
        project: metadata.project || '',
        task: metadata.task || '',
      }),
    },
    true,
  );
  const uploaded = await uploadDriveChunks(session.uploadUrl, file, session.chunkSizeBytes || 8 * 1024 * 1024, onProgress);
  return request(
    '/api/files/upload-complete',
    {
      method: 'POST',
      body: JSON.stringify({ ticket: session.ticket, fileId: uploaded.id || '' }),
    },
    true,
  );
}

export function uploadWorkspaceFile(file, metadata, onProgress) {
  return metadata.direct ? uploadWorkspaceFileDirect(file, metadata, onProgress) : uploadWorkspaceFileThroughApi(file, metadata, onProgress);
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
