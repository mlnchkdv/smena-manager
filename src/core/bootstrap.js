import {
  clearSession,
  getAuthConfig,
  getCurrentUser,
  getPersonalPreferences,
  getFileUploadPolicy,
  getSessionToken,
  getWorkspace,
  getWorkspaceDocument,
  getWorkspaceRevision,
  loginWithAccessId,
  loginWithGoogle,
  migrateLegacySessionCookie,
  putWorkspace,
  putWorkspaceDocument,
} from './api.js';
import { S, save, setWorkspaceBaseline } from './store.js';
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
} from './workspace-sync.js';
import { bindInitialAdministrator, memberForProfile } from '../shared/member-identity.js';
import { emptyWorkspace } from '../shared/empty-workspace.js';
import { mergeWorkspaceData } from '../shared/workspace-merge.js';
import { DOCUMENT_NAMES, mergeWorkspaceDocuments, workspaceCoreData, workspaceDocumentData } from '../shared/workspace-documents.js';

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
  user = await getCurrentUser();
  let snapshot = await getWorkspace();
  const documentSnapshots = Object.fromEntries(await Promise.all(DOCUMENT_NAMES.map(async name => [name, await getWorkspaceDocument(name)])));
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
  applyWorkspaceSnapshot(snapshot, documentSnapshots);
  const personal = await getPersonalPreferences();
  Object.assign(S.prefs, personal.preferences);
  configurePersonalPreferences(user.id, S.prefs);
  for (const scope of ['workspace', ...DOCUMENT_NAMES]) {
    try {
      const journal = createDraftJournal({ ...draftContext(user, S.data), scope });
      const draft = await journal.read();
      if (!draft?.base || !draft.local) continue;
      const remote = scope === 'workspace' ? workspaceCoreData(S.data) : workspaceDocumentData(scope, S.data);
      const recovered = mergeWorkspaceData(draft.base, draft.local, remote);
      if (recovered.conflicts.length) {
        storeConflictRecovery(draft.local, { scope, owner: user.id, conflicts: recovered.conflicts });
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
  S.ui.filePolicy = await getFileUploadPolicy().catch(() => null);
  if (user.name) S.prefs.name = user.name;
  S.prefs.title = user.title || '';
  return user;
}

export async function restoreSessionAndWorkspace() {
  S.ui.authConfig = await getAuthConfig();
  if (!getSessionToken()) return null;
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
  S.ui.currentUser = await getCurrentUser();
  const force = options.force === true;
  if (!force && !workspaceSyncIsClean(S.data)) return { status: 'local_changes' };
  const startingRevision = S.ui.workspaceRevision;
  if (!force) {
    const remote = await getWorkspaceRevision();
    const documentsCurrent = DOCUMENT_NAMES.every(name => Number(remote.documents?.[name]?.revision || 0) === Number(S.ui.documentRevisions?.[name] || 0));
    if (Number(remote.revision) === Number(startingRevision || 0) && documentsCurrent) return { status: 'current' };
  }
  const [snapshot, ...loadedDocuments] = await Promise.all([getWorkspace(), ...DOCUMENT_NAMES.map(name => getWorkspaceDocument(name))]);
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
  } catch {
    /* The current tab still retains the draft when storage is unavailable. */
  }
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
