import {
  clearSession,
  getAuthConfig,
  getCurrentUser,
  getFileUploadPolicy,
  getSessionToken,
  getWorkspace,
  loginWithAccessId,
  loginWithGoogle,
  putWorkspace,
} from './api.js';
import { S, setWorkspaceBaseline } from './store.js';
import { isEmptyWorkspace, workspacePayload } from './workspace-snapshot.js';
import { configureWorkspaceSync } from './workspace-sync.js';
import { bindInitialAdministrator, memberForProfile } from '../shared/member-identity.js';
import { emptyWorkspace } from '../shared/empty-workspace.js';

export function applyWorkspaceSnapshot(snapshot) {
  const data = workspacePayload(snapshot);
  if (!data.ws || !Array.isArray(data.projects) || !Array.isArray(data.tasks)) {
    throw new Error('Workspace data has an unsupported format.');
  }
  const member = memberForProfile(data, S.ui.currentUser);
  if (!member) throw new Error('Your access profile is not linked to a workspace member.');
  if (S.ui.currentUser?.name) member.name = S.ui.currentUser.name;
  if (S.ui.currentUser?.email) member.email = S.ui.currentUser.email;
  if (S.ui.currentUser?.title) member.title = S.ui.currentUser.title;
  if (S.ui.currentUser?.team) member.team = S.ui.currentUser.team;
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
    const initialData = bindInitialAdministrator(emptyWorkspace(workspacePayload(snapshot)), user);
    snapshot = { ...snapshot, ...initialData };
    S.ui.needsOnboarding = true;
  } else if (!memberForProfile(workspacePayload(snapshot), user)) {
    const migrated = bindInitialAdministrator(workspacePayload(snapshot), user);
    snapshot =
      user.role === 'admin' && S.ui.authConfig?.workspaceWritesEnabled
        ? await putWorkspace(migrated, Number(snapshot.revision || 0))
        : { ...snapshot, ...migrated };
    S.ui.needsOnboarding = false;
  } else {
    S.ui.needsOnboarding = false;
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

export async function authenticateWithGoogleAndLoadWorkspace(credential) {
  const user = await loginWithGoogle(credential);
  try {
    return await loadWorkspaceFor(user);
  } catch (error) {
    clearSession();
    throw error;
  }
}
