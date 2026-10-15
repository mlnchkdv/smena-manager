import { clearSession, getAuthConfig, getCurrentUser, getFileUploadPolicy, getSessionToken, getWorkspace, loginWithAccessId, putWorkspace } from './api.js';
import { S, setWorkspaceBaseline } from './store.js';
import { isEmptyWorkspace, workspacePayload } from './workspace-snapshot.js';
import { configureWorkspaceSync } from './workspace-sync.js';
import { bindInitialAdministrator, memberForProfile } from '../shared/member-identity.js';

export function applyWorkspaceSnapshot(snapshot) {
  const data = workspacePayload(snapshot);
  if (!data.ws || !Array.isArray(data.projects) || !Array.isArray(data.tasks)) {
    throw new Error('Workspace data has an unsupported format.');
  }
  const member = memberForProfile(data, S.ui.currentUser);
  if (!member) throw new Error('Your access profile is not linked to a workspace member.');
  data.me = member.id;
  S.data = data;
  S.ui.workspaceRevision = Number(snapshot.revision || 0);
  setWorkspaceBaseline(data);
  configureWorkspaceSync(S.ui.workspaceRevision, S.ui.currentUser?.role, data);
}

async function loadWorkspaceFor(user) {
  let snapshot = await getWorkspace();
  if (isEmptyWorkspace(snapshot)) {
    if (user.role !== 'admin') throw new Error('The workspace has not been initialized yet.');
    S.data = bindInitialAdministrator(S.data, user);
    snapshot = await putWorkspace(S.data, Number(snapshot.revision || 0));
  } else if (!memberForProfile(workspacePayload(snapshot), user) && user.role === 'admin') {
    const migrated = bindInitialAdministrator(workspacePayload(snapshot), user);
    snapshot = await putWorkspace(migrated, Number(snapshot.revision || 0));
  }
  S.ui.currentUser = user;
  applyWorkspaceSnapshot(snapshot);
  S.ui.filePolicy = await getFileUploadPolicy().catch(() => null);
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
