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
import { configureWorkspaceSync, workspaceSyncConflict, workspaceSyncIsClean } from './workspace-sync.js';
import { bindInitialAdministrator, memberForProfile } from '../shared/member-identity.js';
import { emptyWorkspace } from '../shared/empty-workspace.js';
import { mergeWorkspaceData } from '../shared/workspace-merge.js';

const CONFLICT_RECOVERY_KEY = 'smena.recovery.conflict.v1';

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

export async function refreshWorkspaceFromServer(options = {}) {
  if (!S.ui.currentUser || !getSessionToken()) return { status: 'signed_out' };
  const force = options.force === true;
  if (!force && !workspaceSyncIsClean(S.data)) return { status: 'local_changes' };
  const startingRevision = S.ui.workspaceRevision;
  const snapshot = await getWorkspace();
  if (!force && (!workspaceSyncIsClean(S.data) || S.ui.workspaceRevision !== startingRevision)) return { status: 'local_changes' };
  if (Number(snapshot.revision || 0) === Number(S.ui.workspaceRevision || 0)) return { status: 'current' };
  applyWorkspaceSnapshot(snapshot);
  S.ui.syncConflict = false;
  return { status: 'updated', revision: S.ui.workspaceRevision };
}

function storeConflictRecovery(data, details = {}) {
  try {
    localStorage.setItem(CONFLICT_RECOVERY_KEY, JSON.stringify({ savedAt: new Date().toISOString(), data, ...details }));
  } catch {
    /* The current tab still retains the draft when storage is unavailable. */
  }
}

export async function recoverWorkspaceConflict() {
  const conflict = workspaceSyncConflict();
  if (!conflict) return { status: 'none' };
  let local = structuredClone(S.data || conflict.local);
  const base = conflict.base || conflict.local;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const snapshot = await getWorkspace();
    const remote = workspacePayload(snapshot);
    const merged = mergeWorkspaceData(base, local, remote);
    if (merged.conflicts.length) {
      storeConflictRecovery(local, {
        baseRevision: conflict.revision,
        remoteRevision: Number(snapshot.revision || 0),
        conflicts: merged.conflicts,
      });
      return { status: 'manual', conflicts: merged.conflicts };
    }
    try {
      const saved = await putWorkspace(merged.data, Number(snapshot.revision || 0));
      applyWorkspaceSnapshot(saved);
      S.ui.syncConflict = false;
      try {
        localStorage.removeItem(CONFLICT_RECOVERY_KEY);
      } catch {
        /* Storage may be unavailable. */
      }
      return { status: 'merged', revision: S.ui.workspaceRevision };
    } catch (error) {
      if (error.status !== 409 && error.code !== 'REVISION_CONFLICT') throw error;
      local = merged.data;
    }
  }

  storeConflictRecovery(local, { baseRevision: conflict.revision, reason: 'repeated_conflict' });
  return { status: 'manual', conflicts: ['workspace'] };
}
