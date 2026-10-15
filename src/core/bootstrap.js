import { clearSession, getAuthConfig, getCurrentUser, getSessionToken, getWorkspace, loginWithAccessId, putWorkspace } from './api.js';
import { S, setWorkspaceBaseline } from './store.js';
import { isEmptyWorkspace, workspacePayload } from './workspace-snapshot.js';
import { configureWorkspaceSync } from './workspace-sync.js';

function applyWorkspace(snapshot) {
  const data = workspacePayload(snapshot);
  if (!data.ws || !Array.isArray(data.projects) || !Array.isArray(data.tasks)) {
    throw new Error('Workspace data has an unsupported format.');
  }
  S.data = data;
  S.ui.workspaceRevision = Number(snapshot.revision || 0);
  setWorkspaceBaseline(data);
  configureWorkspaceSync(S.ui.workspaceRevision, S.ui.currentUser?.role, data);
}

async function loadWorkspaceFor(user) {
  let snapshot = await getWorkspace();
  if (isEmptyWorkspace(snapshot)) {
    if (user.role !== 'admin') throw new Error('The workspace has not been initialized yet.');
    snapshot = await putWorkspace(S.data, Number(snapshot.revision || 0));
  }
  S.ui.currentUser = user;
  applyWorkspace(snapshot);
  if (user.name) S.prefs.name = user.name;
  return user;
}

export async function restoreSessionAndWorkspace() {
  S.ui.authConfig = await getAuthConfig();
  if (!getSessionToken()) return null;
  try {
    const user = await getCurrentUser();
    return await loadWorkspaceFor(user);
  } catch (error) {
    if (error.status === 401) clearSession();
    throw error;
  }
}

export async function authenticateAndLoadWorkspace(accessId) {
  const user = await loginWithAccessId(accessId);
  try {
    return await loadWorkspaceFor(user);
  } catch (error) {
    clearSession();
    throw error;
  }
}
