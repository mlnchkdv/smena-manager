import { WORKSPACE_TRANSPORT_MAX_BYTES, workspaceTransportBytes } from '../shared/workspace-size.js';
import { workspaceCoreData } from '../shared/workspace-documents.js';
import { parseAppLocation } from '../shared/app-location.js';

export const SESSION_STORAGE_KEY = 'smena.session.v1';
let memorySessionToken = '';
let sessionGeneration = 0;
let sessionAccount = '';
let sessionBlocked = false;
let revisionCache = null;

export const getSessionGeneration = () => sessionGeneration;
function assertSessionGeneration(generation) {
  if (generation !== sessionGeneration) throw new ApiError('The signed-in account changed. Sign in again.', 0, 'SESSION_CHANGED', { staleSession: true });
}

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
  sessionGeneration += 1;
  sessionAccount = '';
  sessionBlocked = false;
  revisionCache = null;
  memorySessionToken = token || '';
  try {
    if (token) localStorage.setItem(SESSION_STORAGE_KEY, token === 'cookie' ? 'cookie' : token);
    else localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    /* The in-memory token keeps the active tab working. */
  }
}

export function clearSession() {
  setSessionToken('');
}

function accountChanged() {
  if (!sessionBlocked) {
    sessionBlocked = true;
    sessionGeneration += 1;
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('smena:session-account-changed'));
  }
  return new ApiError('The account changed in another tab. Reload this page to continue.', 409, 'SESSION_ACCOUNT_CHANGED', { staleSession: true });
}

function addAccountHeader(headers) {
  if (sessionBlocked) throw accountChanged();
  if (sessionAccount) headers.set('X-Smena-Account', encodeURIComponent(sessionAccount));
  return headers;
}

async function request(path, options = {}, authenticated = false) {
  const generation = sessionGeneration;
  const { returnMeta = false, allowCookieOnly = false, catalogHydration = true, ...fetchOptions } = options;
  const headers = new Headers(fetchOptions.headers || {});
  headers.set('Accept', 'application/json');
  if (fetchOptions.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (authenticated) {
    headers.set('X-Smena-File-Catalog', 'demand');
    const token = getSessionToken();
    if (!token && !allowCookieOnly) throw new ApiError('Authentication required.', 401, 'AUTH_REQUIRED');
    if (token !== 'cookie') headers.set('Authorization', `Bearer ${token}`);
    addAccountHeader(headers);
  }

  let response;
  try {
    response = await fetch(path, { ...fetchOptions, credentials: 'include', headers });
  } catch (error) {
    throw new ApiError('The server is unavailable.', 0, 'NETWORK_ERROR', { cause: error });
  }

  const notModified = response.status === 304;
  const body = notModified ? {} : await response.json().catch(() => ({}));
  if (authenticated && generation !== sessionGeneration)
    throw new ApiError('The signed-in account changed. Sign in again.', 0, 'SESSION_CHANGED', { staleSession: true });
  if (!response.ok && !notModified) {
    if (authenticated && body.code === 'SESSION_ACCOUNT_CHANGED') throw accountChanged();
    const message =
      typeof body.error === 'string'
        ? body.error
        : response.status >= 500
          ? 'The server is unavailable.'
          : typeof body.error?.message === 'string'
            ? body.error.message
            : `Request failed (${response.status}).`;
    const code = typeof body.code === 'string' ? body.code : typeof body.error?.code === 'string' ? body.error.code : 'API_ERROR';
    const error = new ApiError(message, response.status, code, body);
    if (response.status === 401 && authenticated && generation === sessionGeneration) clearSession();
    throw error;
  }
  if (catalogHydration && body.fileCatalog) {
    const { requestFileIdentities } = await import('./file-catalog-transport.js');
    assertSessionGeneration(generation);
    if (typeof location !== 'undefined') {
      const target = parseAppLocation(location.pathname);
      if (target.kind === 'file' && target.key) requestFileIdentities([target.key], generation);
    }
    body.data = await readCatalogSnapshot(body, generation);
    delete body.fileCatalog;
    if (generation !== sessionGeneration) throw new ApiError('The signed-in account changed. Sign in again.', 0, 'SESSION_CHANGED', { staleSession: true });
  }
  return returnMeta ? { body, headers: response.headers, notModified } : body;
}

export const getAuthConfig = () => request('/api/auth/config');
export const getPersonalPreferences = () => request('/api/preferences', {}, true);
export const listFileExports = () => request('/api/files/exports', {}, true);
export const createFileExport = ids => request('/api/files/exports', { method: 'POST', body: JSON.stringify({ ids }) }, true);
export const advanceFileExport = id => request(`/api/files/exports/${encodeURIComponent(id)}/advance`, { method: 'POST' }, true);
export const cancelFileExport = id => request(`/api/files/exports/${encodeURIComponent(id)}`, { method: 'DELETE' }, true);
export const prepareFileArchive = (ids, revision, signal) =>
  request('/api/files/archive/preflight', { method: 'POST', body: JSON.stringify({ ids, revision }), signal }, true);
export const savePersonalSettings = data => request('/api/preferences', { method: 'PUT', body: JSON.stringify(data) }, true);
export const retryNotificationDelivery = () => request('/api/notifications/retry', { method: 'POST' }, true);
export const sendTestNotification = channel => request('/api/notifications/test', { method: 'POST', body: JSON.stringify({ channel }) }, true);
export const commitPortableImport = (payload, revision, conflictPolicy) =>
  request('/api/import/portable', { method: 'POST', body: JSON.stringify({ payload, revision, conflictPolicy }) }, true);

export async function loginWithAccessId(accessId) {
  const result = await request('/api/auth/validate', {
    method: 'POST',
    body: JSON.stringify({ accessId }),
  });
  setSessionToken('cookie');
  sessionAccount = result.user?.id || '';
  return result.user;
}

export async function loginWithGoogle(credential) {
  const result = await request('/api/auth/google', {
    method: 'POST',
    body: JSON.stringify({ credential }),
  });
  setSessionToken('cookie');
  sessionAccount = result.user?.id || '';
  return result.user;
}

export async function getCurrentUser(options = {}) {
  const result = await request('/api/auth/me', options, true);
  sessionAccount = result.user?.id || '';
  return result.user;
}

export async function migrateLegacySessionCookie() {
  const token = getSessionToken();
  if (!token || token === 'cookie') return;
  await request('/api/auth/cookie', { method: 'POST' }, true);
  setSessionToken('cookie');
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
  return (await request('/api/workspace', {}, true)).data;
}

async function readCatalogSnapshot(result, generation = sessionGeneration) {
  const { hydrateFileCatalog, requestFileIdentities } = await import('./file-catalog-transport.js');
  assertSessionGeneration(generation);
  if (result?.file?.id) requestFileIdentities([result.file.id], generation);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (generation !== sessionGeneration) throw new ApiError('The signed-in account changed. Sign in again.', 0, 'SESSION_CHANGED', { staleSession: true });
    try {
      const snapshot = result || (await request('/api/workspace', { catalogHydration: false }, true));
      return await hydrateFileCatalog(snapshot, (path, options = {}) => request(path, options, true), generation);
    } catch (error) {
      if (error.code !== 'REVISION_CONFLICT' || attempt === 2) throw error;
      result = null;
    }
  }
}

export const queryFileCatalog = options => request('/api/files/catalog/query', { method: 'POST', body: JSON.stringify(options) }, true);
export async function loadFileIdentities(ids, replace = false) {
  const generation = sessionGeneration;
  const { requestFileIdentities } = await import('./file-catalog-transport.js');
  assertSessionGeneration(generation);
  requestFileIdentities(ids, generation, replace);
  return getWorkspace();
}
export async function loadCompleteFileCatalog() {
  const generation = sessionGeneration;
  const current = await getWorkspace();
  const files = [];
  let offset = 0;
  do {
    assertSessionGeneration(generation);
    const page = await request(`/api/files/catalog?revision=${current.revision}&offset=${offset}`, {}, true);
    files.push(...page.files);
    offset = page.nextOffset;
  } while (offset !== null);
  assertSessionGeneration(generation);
  return loadFileIdentities(files.map(file => file.id));
}

export async function getWorkspaceRevision() {
  const result = await request(
    '/api/workspace/revision',
    { ...(revisionCache?.etag ? { headers: { 'If-None-Match': revisionCache.etag } } : {}), returnMeta: true },
    true,
  );
  if (result.notModified && revisionCache?.value) return revisionCache.value;
  const value = result.body;
  revisionCache = { etag: result.headers.get('etag') || '', value };
  return value;
}

export async function getWorkspaceDocument(name) {
  const result = await request(`/api/workspace-documents/${encodeURIComponent(name)}`, {}, true);
  return result.data;
}
export async function searchKnowledgePage({ query = '', folder = 'all', tag = '', sort = 'updated', offset = 0 } = {}) {
  return request(`/api/knowledge/search?${new URLSearchParams({ q: query, folder, tag, sort, offset: String(offset) })}`, {}, true);
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
  const generation = sessionGeneration;
  const { catalogWrite } = await import('./file-catalog-transport.js');
  assertSessionGeneration(generation);
  const coreData = workspaceCoreData(data);
  const payload = catalogWrite(coreData, revision, generation);
  const actualBytes = new TextEncoder().encode(JSON.stringify({ ...payload, revision })).byteLength;
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
      body: JSON.stringify({ ...payload, revision }),
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
  const generation = sessionGeneration;
  return new Promise((resolve, reject) => {
    if (metadata.signal?.aborted) return reject(new ApiError('Upload cancelled.', 0, 'UPLOAD_CANCELLED'));
    const token = getSessionToken();
    if (!token) {
      reject(new ApiError('Authentication required.', 401, 'AUTH_REQUIRED'));
      return;
    }
    if (sessionBlocked) return reject(accountChanged());
    const form = new FormData();
    form.append('file', file);
    form.append('name', file.name);
    form.append('revision', String(metadata.revision));
    form.append('project', metadata.project || '');
    if (metadata.folderId) form.append('folderId', metadata.folderId);
    if (metadata.task) form.append('task', metadata.task);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/files/upload');
    xhr.setRequestHeader('X-Smena-File-Catalog', 'demand');
    xhr.withCredentials = true;
    if (token !== 'cookie') xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    if (sessionAccount) xhr.setRequestHeader('X-Smena-Account', encodeURIComponent(sessionAccount));
    xhr.responseType = 'json';
    xhr.timeout = 120000;
    const abort = () => xhr.abort();
    metadata.signal?.addEventListener('abort', abort, { once: true });
    xhr.onloadend = () => metadata.signal?.removeEventListener('abort', abort);
    xhr.ontimeout = () => reject(new ApiError('Upload timed out. Try again.', 0, 'UPLOAD_TIMEOUT'));
    xhr.upload.onprogress = event => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onerror = () => reject(new ApiError('The server is unavailable.', 0, 'NETWORK_ERROR'));
    xhr.onabort = () => reject(new ApiError('Upload cancelled.', 0, 'UPLOAD_CANCELLED'));
    xhr.onload = async () => {
      if (generation !== sessionGeneration)
        return reject(new ApiError('The signed-in account changed. Sign in again.', 0, 'SESSION_CHANGED', { staleSession: true }));
      const body = xhr.response || {};
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          if (body.fileCatalog) {
            body.data = await readCatalogSnapshot(body, generation);
            delete body.fileCatalog;
          }
          if (generation !== sessionGeneration)
            throw new ApiError('The signed-in account changed. Sign in again.', 0, 'SESSION_CHANGED', { staleSession: true });
          resolve(body);
        } catch (error) {
          reject(error);
        }
      } else {
        if (body.code === 'SESSION_ACCOUNT_CHANGED') return reject(accountChanged());
        if (xhr.status === 401) clearSession();
        reject(new ApiError(body.error || `Upload failed (${xhr.status}).`, xhr.status, body.code || 'UPLOAD_FAILED', body));
      }
    };
    xhr.send(form);
  });
}

function uploadDriveChunks(uploadUrl, file, chunkSizeBytes, onProgress, signal, generation) {
  return new Promise((resolve, reject) => {
    let start = 0;
    let failures = 0;
    const attachAbort = xhr => {
      const abort = () => xhr.abort();
      signal?.addEventListener('abort', abort, { once: true });
      xhr.onloadend = () => signal?.removeEventListener('abort', abort);
      xhr.onabort = () => reject(new ApiError('Upload cancelled.', 0, 'UPLOAD_CANCELLED'));
      xhr.timeout = 120000;
    };
    const cancelled = () => {
      if (generation !== sessionGeneration) {
        reject(new ApiError('The signed-in account changed. Sign in again.', 0, 'SESSION_CHANGED', { staleSession: true }));
        return true;
      }
      if (!signal?.aborted) return false;
      reject(new ApiError('Upload cancelled.', 0, 'UPLOAD_CANCELLED'));
      return true;
    };
    const probe = () => {
      if (cancelled()) return;
      if (++failures > 3) return reject(new ApiError('Google Drive is unavailable. Try the upload again.', 0, 'DIRECT_UPLOAD_NETWORK_ERROR'));
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', uploadUrl);
      xhr.setRequestHeader('Content-Range', `bytes */${file.size}`);
      xhr.responseType = 'json';
      attachAbort(xhr);
      xhr.onerror = xhr.ontimeout = () => setTimeout(probe, 1000);
      xhr.onload = () => {
        if (cancelled()) return;
        if (xhr.status >= 200 && xhr.status < 300) return resolve(xhr.response || {});
        if (xhr.status !== 308) return reject(new ApiError(`Google Drive rejected the upload (${xhr.status}).`, xhr.status, 'DIRECT_UPLOAD_FAILED'));
        const accepted = /bytes=0-(\d+)/.exec(xhr.getResponseHeader('Range') || '');
        start = accepted ? Number(accepted[1]) + 1 : 0;
        if (start < 0 || start >= file.size) return reject(new ApiError('Invalid upload progress.', 0, 'DIRECT_UPLOAD_FAILED'));
        sendNext();
      };
      xhr.send();
    };
    const sendNext = () => {
      if (cancelled()) return;
      const end = Math.min(start + chunkSizeBytes, file.size);
      const chunk = file.slice(start, end);
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', uploadUrl);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.setRequestHeader('Content-Range', `bytes ${start}-${end - 1}/${file.size}`);
      xhr.responseType = 'json';
      attachAbort(xhr);
      xhr.upload.onprogress = event => {
        if (event.lengthComputable) onProgress?.(Math.round(((start + event.loaded) / file.size) * 100));
      };
      xhr.onerror = xhr.ontimeout = probe;
      xhr.onload = () => {
        if (cancelled()) return;
        if (xhr.status === 308) {
          const accepted = /bytes=0-(\d+)/.exec(xhr.getResponseHeader('Range') || '');
          const next = accepted ? Number(accepted[1]) + 1 : 0;
          if (next <= start || next >= file.size) return probe();
          start = next;
          failures = 0;
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
  const generation = sessionGeneration;
  const session = await request(
    '/api/files/upload-session',
    {
      method: 'POST',
      signal: metadata.signal,
      body: JSON.stringify({
        name: file.name,
        size: file.size,
        mimeType: file.type || 'application/octet-stream',
        project: metadata.project || '',
        folderId: metadata.folderId || null,
        task: metadata.task || '',
      }),
    },
    true,
  );
  assertSessionGeneration(generation);
  const uploaded = await uploadDriveChunks(session.uploadUrl, file, session.chunkSizeBytes || 8 * 1024 * 1024, onProgress, metadata.signal, generation);
  assertSessionGeneration(generation);
  return request(
    '/api/files/upload-complete',
    {
      method: 'POST',
      signal: metadata.signal,
      body: JSON.stringify({ ticket: session.ticket, fileId: uploaded.id || '' }),
    },
    true,
  );
}

export function uploadWorkspaceFile(file, metadata, onProgress) {
  return metadata.direct && file.size > 0 ? uploadWorkspaceFileDirect(file, metadata, onProgress) : uploadWorkspaceFileThroughApi(file, metadata, onProgress);
}

export async function downloadWorkspaceFile(id, download = false, options = {}) {
  const generation = sessionGeneration;
  const token = getSessionToken();
  if (!token) throw new ApiError('Authentication required.', 401, 'AUTH_REQUIRED');
  let response;
  try {
    response = await fetch(`/api/files/${encodeURIComponent(id)}/content${download ? '?download=1' : ''}`, {
      headers: addAccountHeader(new Headers(token === 'cookie' ? {} : { Authorization: `Bearer ${token}` })),
      credentials: 'include',
      signal: options.signal,
    });
  } catch (error) {
    if (error.staleSession) throw error;
    throw new ApiError('The server is unavailable.', 0, 'NETWORK_ERROR', { cause: error });
  }
  if (generation !== sessionGeneration) {
    await response.body?.cancel().catch(() => {});
    throw new ApiError('The signed-in account changed. Sign in again.', 0, 'SESSION_CHANGED', { staleSession: true });
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    if (generation !== sessionGeneration) throw new ApiError('The signed-in account changed. Sign in again.', 0, 'SESSION_CHANGED', { staleSession: true });
    if (body.code === 'SESSION_ACCOUNT_CHANGED') throw accountChanged();
    throw new ApiError(body.error || 'Unable to open the file.', response.status, body.code || 'FILE_ERROR', body);
  }
  let blob;
  const bounded = Number.isFinite(options.maxBytes) && options.maxBytes >= 0;
  if (bounded && Number(response.headers.get('content-length')) > options.maxBytes) {
    await response.body?.cancel().catch(() => {});
    throw new ApiError('This file is too large to preview. Download it instead.', 413, 'PREVIEW_TOO_LARGE');
  }
  if (bounded && response.body?.getReader) {
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > options.maxBytes) {
          await reader.cancel();
          throw new ApiError('This file is too large to preview. Download it instead.', 413, 'PREVIEW_TOO_LARGE');
        }
        chunks.push(value);
        options.onProgress?.(total);
      }
    } finally {
      reader.releaseLock();
    }
    blob = new Blob(chunks, { type: response.headers.get('content-type') || 'application/octet-stream' });
  } else blob = await response.blob();
  if (bounded && blob.size > options.maxBytes) throw new ApiError('This file is too large to preview. Download it instead.', 413, 'PREVIEW_TOO_LARGE');
  if (generation !== sessionGeneration) throw new ApiError('The signed-in account changed. Sign in again.', 0, 'SESSION_CHANGED', { staleSession: true });
  return { blob, disposition: response.headers.get('content-disposition') || '' };
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
