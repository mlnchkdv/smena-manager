import { resetSearchSession } from './search-history.js';
import {
  clearSession,
  getAuthConfig,
  getCurrentUser,
  getPersonalPreferences,
  getFileUploadPolicy,
  getSessionToken,
  getSessionGeneration,
  setSessionToken,
  getWorkspace,
  getWorkspaceDocument,
  getWorkspaceRevision,
  loginWithAccessId,
  loginWithGoogle,
  migrateLegacySessionCookie,
  putWorkspace,
  putWorkspaceDocument,
} from './api.js';
import { DEFAULT_PREFS, S, save, setWorkspaceBaseline } from './store.js';
import { createDraftJournal, draftContext } from './offline-drafts.js';
import { configurePersonalPreferences } from './personal-preferences.js';
import { isEmptyWorkspace, workspacePayload } from './workspace-snapshot.js';
import {
  configureCoreWorkspaceSync,
  configureDocumentWorkspaceSync,
  configureWorkspaceSync,
  queueScopedWorkspaceSync,
  workspaceSyncConflict,
  workspaceSyncIsClean,
  workspaceSyncState,
} from './workspace-sync.js';
import { bindInitialAdministrator, memberForProfile } from '../shared/member-identity.js';
import { emptyWorkspace } from '../shared/empty-workspace.js';
import { mergeWorkspaceData } from '../shared/workspace-merge.js';
import { DOCUMENT_NAMES, mergeWorkspaceDocuments, workspaceCoreData, workspaceDocumentData } from '../shared/workspace-documents.js';
import { loadWorkspaceResources } from '../shared/workspace-load.js';

const CONFLICT_RECOVERY_KEY = 'smena.recovery.conflict.v1';

export function applyExternalCoreSnapshot(snapshot, base) {
  const canonical = workspaceCoreData(workspacePayload(snapshot));
  const member = memberForProfile(canonical, S.ui.currentUser);
  if (member) canonical.me = member.id;
  const merged = mergeWorkspaceData(workspaceCoreData(base), workspaceCoreData(S.data), canonical);
  if (merged.conflicts.length) {
    storeConflictRecovery(S.data, { conflicts: merged.conflicts, reason: 'external_write' });
    throw new Error('The same data changed in two sessions. Your version was saved as a recovery copy in this browser.');
  }
  Object.assign(S.data, merged.data);
  S.ui.workspaceRevision = Number(snapshot.revision);
  configureCoreWorkspaceSync(snapshot.revision, S.ui.currentUser?.role, canonical, draftContext(S.ui.currentUser, S.data));
  setWorkspaceBaseline({ ...S.data, ...canonical });
}

export function applyWorkspaceSnapshot(snapshot, documentSnapshots = {}) {
  const resolvedDocuments = Object.fromEntries(
    DOCUMENT_NAMES.map(name => [name, documentSnapshots[name] || { revision: S.ui.documentRevisions?.[name] || 0, ...workspaceDocumentData(name, S.data) }]),
  );
  const data = mergeWorkspaceDocuments(workspacePayload(snapshot), resolvedDocuments);
  if (!data.ws || !Array.isArray(data.projects) || !Array.isArray(data.tasks)) {
    throw new Error('Workspace data has an unsupported format.');
  }
  const member = memberForProfile(data, S.ui.currentUser);
  if (!member) throw new Error('Your access profile is not linked to a workspace member.');
  if (S.ui.currentUser?.name) member.name = S.ui.currentUser.name;
  if (S.ui.currentUser?.email) member.email = S.ui.currentUser.email;
  if (S.ui.currentUser?.title) member.title = S.ui.currentUser.title;
  data.me = member.id;
  S.data = data;
  S.ui.workspaceRevision = Number(snapshot.revision || 0);
  S.ui.documentRevisions = Object.fromEntries(DOCUMENT_NAMES.map(name => [name, Number(resolvedDocuments[name]?.revision || 0)]));
  S.ui.syncState = 'saved';
  S.ui.lastSyncedAt = Date.now();
  setWorkspaceBaseline(data);
  configureWorkspaceSync(S.ui.workspaceRevision, S.ui.currentUser?.role, data, resolvedDocuments, draftContext(S.ui.currentUser, data));
}

async function loadWorkspaceFor(user) {
  const generation = getSessionGeneration();
  user = await getCurrentUser();
  const resources = await loadWorkspaceResources({ getWorkspace, getWorkspaceDocument, getPersonalPreferences, getFileUploadPolicy });
  if (generation !== getSessionGeneration())
    throw Object.assign(new Error('The signed-in account changed. Sign in again.'), { staleSession: true, code: 'SESSION_CHANGED' });
  let { snapshot } = resources;
  const { documentSnapshots, personal, filePolicy } = resources;
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
  resetSearchSession();
  S.ui.currentUser = user;
  applyWorkspaceSnapshot(snapshot, documentSnapshots);
  Object.assign(S.prefs, DEFAULT_PREFS, personal.preferences);
  const recoveredPreferences = await configurePersonalPreferences(user.id, S.prefs, draftContext(user, S.data));
  if (!recoveredPreferences || S.ui.currentUser?.id !== user.id || generation !== getSessionGeneration())
    throw Object.assign(new Error('The signed-in account changed. Sign in again.'), { staleSession: true, code: 'SESSION_CHANGED' });
  if (recoveredPreferences) Object.assign(S.prefs, recoveredPreferences);
  for (const scope of ['workspace', ...DOCUMENT_NAMES]) {
    try {
      const journal = createDraftJournal({ ...draftContext(user, S.data), scope });
      const draft = await journal.read();
      if (!draft?.base || !draft.local) continue;
      const remote = scope === 'workspace' ? workspaceCoreData(S.data) : workspaceDocumentData(scope, S.data);
      const recovered = mergeWorkspaceData(draft.base, draft.local, remote);
      if (recovered.conflicts.length) {
        storeConflictRecovery(draft.local, { scope, owner: user.id, remote, conflicts: recovered.conflicts });
        S.ui.syncConflict = true;
      } else {
        Object.assign(S.data, recovered.data);
        save();
      }
    } catch (error) {
      S.ui.recoveryUnavailable = true;
      console.warn('[Recovery] Local draft could not be loaded:', error.name);
    }
  }
  S.ui.filePolicy = filePolicy;
  if (user.name) S.prefs.name = user.name;
  S.prefs.title = user.title || '';
  return user;
}

export async function restoreSessionAndWorkspace() {
  S.ui.authConfig = await getAuthConfig();
  if (!getSessionToken()) {
    // The local marker may be unavailable in private/in-app browser contexts,
    // while the HttpOnly session cookie is still valid. Ask the server before
    // showing the login screen so a reload does not sign the user out.
    try {
      const user = await getCurrentUser({ allowCookieOnly: true });
      setSessionToken('cookie');
      return await loadWorkspaceFor(user);
    } catch (error) {
      if (error.status === 401) return null;
      throw error;
    }
  }
  try {
    await migrateLegacySessionCookie();
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
    if (!error.staleSession) clearSession();
    throw error;
  }
}

export async function authenticateWithGoogleAndLoadWorkspace(credential) {
  const user = await loginWithGoogle(credential);
  try {
    return await loadWorkspaceFor(user);
  } catch (error) {
    if (!error.staleSession) clearSession();
    throw error;
  }
}

export async function refreshWorkspaceFromServer(options = {}) {
  if (!S.ui.currentUser || !getSessionToken()) return { status: 'signed_out' };
  const force = options.force === true;
  const owner = S.ui.currentUser.id;
  if (force) {
    const user = await getCurrentUser();
    if (S.ui.currentUser?.id !== owner || !getSessionToken()) return { status: 'session_changed' };
    if (user.id !== owner) throw Object.assign(new Error('The signed-in account changed. Sign in again.'), { status: 401, code: 'SESSION_ACCOUNT_CHANGED' });
    S.ui.currentUser = user;
  }
  const startingRevision = S.ui.workspaceRevision;
  if (!force) {
    const remote = await getWorkspaceRevision();
    if (S.ui.currentUser?.id !== owner || !getSessionToken()) return { status: 'session_changed' };
    if (remote.user) {
      if (remote.user.id !== owner)
        throw Object.assign(new Error('The signed-in account changed. Sign in again.'), { status: 401, code: 'SESSION_ACCOUNT_CHANGED' });
      S.ui.currentUser = remote.user;
    }
    if (!workspaceSyncIsClean(S.data)) return { status: 'local_changes' };
    const documentsCurrent = DOCUMENT_NAMES.every(name => Number(remote.documents?.[name]?.revision || 0) === Number(S.ui.documentRevisions?.[name] || 0));
    if (Number(remote.revision) === Number(startingRevision || 0) && documentsCurrent) return { status: 'current' };
  }
  const [snapshot, ...loadedDocuments] = await Promise.all([getWorkspace(), ...DOCUMENT_NAMES.map(name => getWorkspaceDocument(name))]);
  if (S.ui.currentUser?.id !== owner || !getSessionToken()) return { status: 'session_changed' };
  const documentSnapshots = Object.fromEntries(DOCUMENT_NAMES.map((name, index) => [name, loadedDocuments[index]]));
  if (!force && (!workspaceSyncIsClean(S.data) || S.ui.workspaceRevision !== startingRevision)) return { status: 'local_changes' };
  const documentsCurrent = DOCUMENT_NAMES.every(name => Number(documentSnapshots[name]?.revision || 0) === Number(S.ui.documentRevisions?.[name] || 0));
  if (Number(snapshot.revision || 0) === Number(S.ui.workspaceRevision || 0) && documentsCurrent) return { status: 'current' };
  applyWorkspaceSnapshot(snapshot, documentSnapshots);
  S.ui.syncConflict = false;
  return { status: 'updated', revision: S.ui.workspaceRevision };
}

function storeConflictRecovery(data, details = {}) {
  const owner = S.ui.currentUser?.id || '';
  const scope = details.scope || workspaceSyncConflict()?.scope || 'workspace';
  S.ui.syncRecovery = { data: structuredClone(data), ...details, owner, scope };
  try {
    localStorage.setItem(`${CONFLICT_RECOVERY_KEY}:${owner}:${scope}`, JSON.stringify({ savedAt: new Date().toISOString(), ...S.ui.syncRecovery }));
    return true;
  } catch {
    /* The current tab still retains the draft when storage is unavailable. */
    return false;
  }
}

export async function acceptServerConflictVersion(options = {}) {
  const recovery = S.ui.syncRecovery;
  const owner = S.ui.currentUser?.id;
  if (!recovery || recovery.owner !== owner) throw new Error('No recovery copy is available for this account.');
  const scope = recovery.scope;
  if (scope !== 'workspace' && !DOCUMENT_NAMES.includes(scope)) throw new Error('Invalid recovery scope.');
  const scopeData = data => (scope === 'workspace' ? workspaceCoreData(data) : workspaceDocumentData(scope, data));
  const before = structuredClone(scopeData(S.data));
  const snapshot = scope === 'workspace' ? await getWorkspace() : await getWorkspaceDocument(scope);
  if (owner !== S.ui.currentUser?.id || JSON.stringify(before) !== JSON.stringify(scopeData(S.data)))
    throw new Error('Local data changed. Review the conflict again before loading the server version.');
  // Keep an explicit recovery copy even after the user accepts the server version.
  if (!storeConflictRecovery(recovery.data, { ...recovery, currentLocal: before, acceptedAt: new Date().toISOString() }))
    throw new Error('Local recovery storage is unavailable. Keep this tab open until changes are saved.');
  const context = draftContext(S.ui.currentUser, S.data);
  const journal = (options.createJournal || createDraftJournal)({ ...context, scope });
  const draft = await journal.read();
  if (draft) await journal.acknowledge(draft.local);
  if (owner !== S.ui.currentUser?.id || JSON.stringify(before) !== JSON.stringify(scopeData(S.data)))
    throw new Error('Local data changed. Review the conflict again before loading the server version.');
  const canonical = scopeData(workspacePayload(snapshot));
  if (scope === 'workspace') {
    canonical.me = S.data.me;
    S.ui.workspaceRevision = Number(snapshot.revision);
    configureCoreWorkspaceSync(snapshot.revision, S.ui.currentUser.role, canonical, context);
  } else {
    S.ui.documentRevisions[scope] = Number(snapshot.revision);
    configureDocumentWorkspaceSync(scope, snapshot.revision, S.ui.currentUser.role, canonical, context);
  }
  Object.assign(S.data, canonical);
  S.ui.workspaceBaseline = { ...S.ui.workspaceBaseline, ...canonical };
  S.ui.syncRecovery = null;
  S.ui.syncConflict = workspaceSyncState().hasConflict;
  S.ui.syncState = S.ui.syncConflict
    ? 'conflict'
    : Object.values(workspaceSyncState().errors)[0] || (workspaceSyncState().hasActive || workspaceSyncState().hasPending ? 'syncing' : 'saved');
  S.ui.lastSyncedAt = Date.now();
  if (S.ui.syncConflict) await recoverWorkspaceConflict();
  return { status: 'updated' };
}

export async function recoverWorkspaceConflict() {
  const conflict = workspaceSyncConflict();
  if (!conflict) return { status: 'none' };
  const scopeData = data => (conflict.scope === 'workspace' ? workspaceCoreData(data) : workspaceDocumentData(conflict.scope, data));
  let local = structuredClone(scopeData(S.data));
  let observedLocal = structuredClone(local);
  let base = conflict.base || conflict.local;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const snapshot = conflict.scope === 'workspace' ? await getWorkspace() : await getWorkspaceDocument(conflict.scope);
    const edited = mergeWorkspaceData(observedLocal, scopeData(S.data), local);
    if (edited.conflicts.length) {
      storeConflictRecovery(scopeData(S.data), { scope: conflict.scope, conflicts: edited.conflicts });
      return { status: 'manual', conflicts: edited.conflicts };
    }
    local = edited.data;
    observedLocal = structuredClone(scopeData(S.data));
    const remote = scopeData(workspacePayload(snapshot));
    if (conflict.scope === 'workspace') remote.me = local.me;
    const merged = mergeWorkspaceData(base, local, remote);
    if (merged.conflicts.length) {
      storeConflictRecovery(local, {
        baseRevision: conflict.revision,
        remoteRevision: Number(snapshot.revision || 0),
        conflicts: merged.conflicts,
        scope: conflict.scope,
        remote,
      });
      return { status: 'manual', conflicts: merged.conflicts };
    }
    try {
      const sentLocal = structuredClone(scopeData(S.data));
      const saved =
        conflict.scope === 'workspace'
          ? await putWorkspace(merged.data, Number(snapshot.revision || 0))
          : await putWorkspaceDocument(conflict.scope, merged.data, Number(snapshot.revision || 0));
      const canonical = scopeData(workspacePayload(saved));
      if (conflict.scope === 'workspace') canonical.me = local.me;
      const latest = mergeWorkspaceData(sentLocal, scopeData(S.data), canonical);
      if (latest.conflicts.length) {
        storeConflictRecovery(scopeData(S.data), { scope: conflict.scope, remote: canonical, conflicts: latest.conflicts });
        return { status: 'manual', conflicts: latest.conflicts };
      }
      Object.assign(S.data, latest.data);
      const context = draftContext(S.ui.currentUser, S.data);
      if (conflict.scope === 'workspace') {
        S.ui.workspaceRevision = Number(saved.revision);
        configureCoreWorkspaceSync(saved.revision, S.ui.currentUser?.role, canonical, context);
      } else {
        S.ui.documentRevisions[conflict.scope] = Number(saved.revision);
        configureDocumentWorkspaceSync(conflict.scope, saved.revision, S.ui.currentUser?.role, canonical, context);
      }
      S.ui.workspaceBaseline = { ...S.ui.workspaceBaseline, ...canonical };
      void queueScopedWorkspaceSync(conflict.scope, latest.data);
      S.ui.syncConflict = false;
      try {
        localStorage.removeItem(`${CONFLICT_RECOVERY_KEY}:${S.ui.currentUser?.id || ''}:${conflict.scope}`);
      } catch {
        /* Storage may be unavailable. */
      }
      return { status: 'merged', revision: S.ui.workspaceRevision };
    } catch (error) {
      if (error.status !== 409 && error.code !== 'REVISION_CONFLICT') throw error;
      local = merged.data;
      base = remote;
    }
  }

  storeConflictRecovery(local, { baseRevision: conflict.revision, reason: 'repeated_conflict' });
  return { status: 'manual', conflicts: ['workspace'] };
}
