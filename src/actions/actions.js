/* =====================================================================
   ACTIONS · INPUT HANDLERS · DRAG & DROP · KEYBOARD · INIT
   ===================================================================== */
import { $, $$, TODAY, addD, dOff, diffD, esc, fmtDate, fmtTimestamp, iso, parse, uid } from '../core/utils.js';
import { PR, PSTAT, ST } from '../core/constants.js';
import { seed } from '../data/seed.js';
import {
  D,
  DEFAULT_PREFS,
  S,
  allTasks,
  canSee,
  commentsOf,
  logAct,
  me,
  mem,
  myNotificationPreferences,
  proj,
  save,
  setMyNotificationPreference,
  task,
  tasksOf,
  teamsList,
  visibleProjects,
} from '../core/store.js';
import { fileType, fsize } from '../ui/helpers.js';
import { knowledgeDisplayParts } from '../shared/knowledge-frontmatter.js';
import { detachTaskFile } from '../shared/file-identity.js';
import { saveFilePreferences } from '../core/file-preferences.js';
import { canEditFile, canRemoveFile } from '../shared/file-access.js';
import { effectiveDark } from '../core/theme.js';
import { mutate, toast } from '../ui/toast.js';
import { autosize, focusKey, fxSet, go, render } from '../shell/render.js';
import { viewOf } from '../shell/view-engine.js';
import { TEMPLATES, closeModal, openModal } from '../overlays/modals.js';
import { closePop, openPop, tgt } from '../overlays/popovers.js';
import {
  applyExternalCoreSnapshot,
  acceptServerConflictVersion,
  authenticateAndLoadWorkspace,
  authenticateWithGoogleAndLoadWorkspace,
  refreshWorkspaceFromServer,
} from '../core/bootstrap.js';
import {
  clearSession,
  getSessionGeneration,
  getSessionToken,
  commitPortableImport,
  createWorkspaceBackup,
  deleteAllWorkspaces,
  downloadWorkspaceFile,
  getStorageStatus,
  getNotificationDeliveryStatus,
  retryNotificationDelivery,
  sendTestNotification,
  getAuthSessions,
  getWorkspaceBackups,
  revokeAuthSession,
  revokeCurrentAuthSession,
  revokeOtherAuthSessions,
  restoreWorkspaceBackup,
  uploadWorkspaceFile,
} from '../core/api.js';
import { disableWorkspaceSync, queueWorkspaceSync, retryWorkspaceSync, workspaceSyncIsClean } from '../core/workspace-sync.js';
import { workspaceHref } from '../shared/product.js';
import { buildPortableWorkspace, mergePortableWorkspace } from '../shared/portable-workspace.js';
import { extractWikiLinks } from '../shared/knowledge-links.js';
import { updateKnowledgeSaveStatus, knowledgeEditBlocked } from '../ui/knowledge-save-status.js';
import { savedBookmarkView } from '../shared/bookmark-view.js';
import { bindWikiReferences, entityAllowed, RELATION_TYPES, resolveGraphEntity } from '../shared/relations.js';
import { graphOptions } from '../ui/relations.js';
import { reviewKnowledgeImport } from '../shared/knowledge-import.js';
import {
  renameKnowledgeFolder as renameKnowledgeFolderData,
  deleteKnowledgeFolder as deleteKnowledgeFolderData,
} from '../shared/knowledge-folder-operations.js';
import { WORKSPACE_TRANSPORT_MAX_BYTES, jsonByteLength } from '../shared/workspace-size.js';
import { workspaceSlug } from '../shared/workspace-slug.js';
import { isRussian, templateText, t } from '../core/i18n.js';
import { resolveAppLocation, entityRouteKey } from '../shared/app-location.js';
import { activeWorkspaceAdministrators, isWorkspaceAdministrator } from '../shared/workspace-membership.js';
import { disableWebPush, enableWebPush, syncWebPushSubscription } from '../core/push-subscriptions.js';
import { hasEnabledPushPreferences } from '../shared/push-client.js';
import { primaryTeamId } from '../shared/team-relations.js';
import { captureUndo, undoCommand } from '../shared/undo.js';
import { canEditProject } from '../shared/project-access.js';
import { nextRecurrenceDate } from '../shared/calendar-time.js';
import { persistPersonalChange, registerNotificationActions } from './notification-loader.js';
import { changePdfPreviewPage } from '../core/file-preview.js';
import { retryPersonalPreferences } from '../core/personal-preferences.js';
import { nextTaskKey } from './task-key.js';

export const A = {},
  IN = {},
  KEY = {},
  DBL = {},
  BLUR = {};

async function refreshSystemStatus() {
  S.ui.systemStatusLoading = true;
  S.ui.systemStatusError = '';
  try {
    S.ui.systemStatus = await getStorageStatus();
  } catch (error) {
    S.ui.systemStatusError = error.message || 'Unable to load system status.';
  } finally {
    S.ui.systemStatusLoading = false;
    if (S.ui.pop?.type === 'user') render();
  }
}

/* ---------- task mutations ---------- */
const nextKey = nextTaskKey;
export function createTask(f) {
  const p = proj(f.project) || visibleProjects().find(canSee);
  const maxO = Math.max(0, ...D().tasks.map(t => t.order));
  const t = Object.assign(
    {
      project: p.id,
      title: 'Untitled',
      status: 'todo',
      assignee: null,
      priority: 'none',
      due: null,
      start: null,
      labels: [],
      subtasks: [],
      attachments: [],
      deps: [],
      desc: '',
      estimate: null,
      created: Date.now(),
      updated: Date.now(),
      order: maxO + 1,
      fav: false,
      recur: null,
    },
    f,
    { project: p.id },
  );
  t.id = f.id || uid('t');
  t.key = f.key || nextKey(p);
  D().tasks.push(t);
  fxSet({ added: t.id });
  logAct('created', t);
  return t;
}
export function applyPatch(t, patch) {
  const msgs = [];
  for (const k of Object.keys(patch)) {
    const old = t[k],
      nv = patch[k];
    if (JSON.stringify(old) === JSON.stringify(nv)) continue;
    t[k] = nv;
    if (k === 'status') {
      if (nv === 'done') {
        t.completedAt = Date.now();
        t.prevStatus = old;
        logAct('completed', t);
        fxSet({ done: t.id });
      } else logAct('moved', t, `from ${ST[old].name} to ${ST[nv].name}`);
      if (nv === 'done' && t.recur && t.due) {
        const nd = nextRecurrenceDate(t.due, t.recur);
        if (D().tasks.some(item => item.recurrenceOf === t.id && item.recurrenceFromDue === t.due)) continue;
        const n = createTask({
          ...JSON.parse(JSON.stringify(t)),
          id: undefined,
          key: undefined,
          status: 'todo',
          due: nd,
          start: t.start ? iso(addD(parse(nd), diffD(parse(t.start), parse(t.due)))) : null,
          subtasks: t.subtasks.map(s => ({ ...s, id: uid('s'), done: false })),
          recurrenceOf: t.id,
          recurrenceFromDue: t.due,
          completedAt: null,
          attachments: [],
        });
        delete n.prevStatus;
        msgs.push(`Next “${t.title}” scheduled for ${fmtDate(nd)}`);
      }
    } else if (k === 'assignee') {
      logAct('assigned', t, nv ? `to ${mem(nv)?.name}` : '(unassigned)');
    } else if (k === 'priority') logAct('changed priority of', t, `to ${PR[nv].name}`);
    else if (k === 'due') logAct('changed due date of', t, nv ? `to ${fmtDate(nv)}` : '(cleared)');
    else if (k === 'start') logAct('changed start date of', t, nv ? `to ${fmtDate(nv)}` : '(cleared)');
    else if (k === 'project') {
      const p = proj(nv);
      t.key = nextKey(p);
      logAct('moved', t, `to ${p.name}`);
    } else if (k === 'labels') logAct('updated labels on', t);
    else if (k === 'title') logAct('renamed', t, `to “${nv}”`);
    else if (k === 'recur') logAct('set repeat on', t, nv ? nv.toLowerCase() : 'off');
    else if (k === 'estimate') logAct('estimated', t, nv || 'none');
    else if (k === 'deps') logAct('updated dependencies of', t);
    t.updated = Date.now();
  }
  return msgs;
}
export function updateTask(id, patch) {
  if (id === '__form') {
    Object.assign(S.ui.form, patch);
    render();
    return;
  }
  const t = task(id);
  if (!t) return;
  let msgs = [];
  if (
    mutate(() => {
      msgs = applyPatch(t, patch);
    })
  )
    msgs.forEach(m => toast(m, { kind: 'info' }));
}
export function confirmDlg(o) {
  S.ui.confirmText = '';
  openModal({ type: 'confirm', ...o });
}
export function snapshot() {
  return captureUndo(S.data);
}
export function restore(snap) {
  const result = undoCommand(snap, S.data);
  if (result.conflicts.length) return toast('Unable to undo: the affected data has changed.', { kind: 'err' });
  S.data = result.data;
  save();
  render();
}
export async function copy(text, msg = 'Link copied') {
  try {
    await navigator.clipboard.writeText(text);
    toast(msg);
  } catch {
    toast("Copy isn't available here — " + text, { kind: 'info', ms: 6000 });
  }
}
export function loadingBtn(id, ms, fn) {
  const b = document.getElementById(id);
  if (b) {
    b.classList.add('is-loading');
    b.setAttribute('aria-busy', 'true');
  }
  setTimeout(fn, ms);
}
export function curProjectId() {
  if (S.ui.route === 'project') return S.ui.params.id;
  return null;
}
export function projectFromKey(key) {
  if (!key) return null;
  if (key.startsWith('p:')) return key.slice(2);
  if (key.startsWith('sv:')) return D().savedViews.find(v => v.id === key.slice(3))?.project;
  return null;
}

function knowledgeCollections() {
  if (!Array.isArray(D().knowledgeNotes)) D().knowledgeNotes = [];
  if (!Array.isArray(D().knowledgeFolders)) D().knowledgeFolders = [];
  return { notes: D().knowledgeNotes, folders: D().knowledgeFolders };
}

const IMPORTANCE_LEVELS = new Set(['low', 'medium', 'high', 'critical']);

function bookmarkCollections() {
  if (!Array.isArray(D().links)) D().links = [];
  if (!Array.isArray(D().linkFolders)) D().linkFolders = [];
  return { links: D().links, folders: D().linkFolders };
}

function emptyBookmarkDraft(folder = '') {
  return { url: '', title: '', description: '', folder, tags: '', importance: 'medium' };
}

function normalizedBookmarkUrl(value) {
  const candidate = /^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`;
  try {
    const parsed = new URL(candidate);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed : null;
  } catch {
    return null;
  }
}

/* ---------- navigation ---------- */
A.go = el => {
  const r = el.dataset.r;
  const p = {};
  if (el.dataset.id) p.id = el.dataset.id;
  if (el.dataset.tab) p.tab = el.dataset.tab;
  else if (r === 'project') p.tab = S.prefs.defaultTab || 'board';
  if (el.dataset.sec) p.sec = el.dataset.sec;
  S.ui.palette = null;
  const tabOnly = r === 'project' && S.ui.route === 'project' && S.ui.params.id === p.id;
  go(r, p, { tab: tabOnly });
  if (r === 'settings' && p.sec === 'security') void A.loadAuthSessions();
  if (r === 'settings' && p.sec === 'data-transfer') void A.loadWorkspaceBackups();
};
A.back = () => {
  const h = S.ui.history.pop();
  if (h) go(h.route, h.params, { back: true });
  else go('home');
};
A.reload = () => render();
A.openProject = el => go('project', { id: el.dataset.id, tab: S.prefs.defaultTab || 'board' });
A.set = el => {
  const k = el.dataset.k;
  let v = el.dataset.v;
  if (/Tab$|Cat$|Mode$|View$/.test(k)) fxSet({ tabs: true });
  if (k === 'inboxSel' && !v) v = null;
  if (k === 'inboxCat') S.ui.inboxSel = null;
  S.ui[k] = v;
  if (k === 'fileView') saveFilePreferences();
  if (k === 'membersTab' || k === 'searchCat') S.ui.pop = null;
  render();
};
A.exportPortableWorkspace = () => {
  if (S.ui.currentUser?.role !== 'admin') return;
  const payload = buildPortableWorkspace(D());
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = `smena-manager-portable-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(href);
  S.ui.migrationStatus = `Exported ${payload.notes.length} notes and ${payload.links.length} bookmarks.`;
  render();
};
A.loadWorkspaceBackups = async () => {
  if (S.ui.currentUser?.role !== 'admin' || S.ui.backupsLoading) return;
  S.ui.backupsLoading = true;
  S.ui.backupsError = '';
  render();
  try {
    const [backups] = await Promise.all([getWorkspaceBackups(), refreshSystemStatus()]);
    S.ui.backups = backups;
  } catch (error) {
    S.ui.backupsError =
      error.code === 'DRIVE_BOOTSTRAP_REQUIRED'
        ? 'Backup storage is not initialized. An administrator must prepare the Drive backups folder.'
        : error.message || 'Unable to load backups.';
    toast(S.ui.backupsError, { kind: 'err' });
  } finally {
    S.ui.backupsLoading = false;
    render();
  }
};
A.createWorkspaceBackup = async el => {
  if (S.ui.currentUser?.role !== 'admin') return;
  el?.classList?.add('is-loading');
  try {
    await queueWorkspaceSync(S.data);
    await createWorkspaceBackup('Manual backup');
    S.ui.backups = await getWorkspaceBackups();
    S.ui.backupsError = '';
    render();
    toast('Backup saved.');
  } catch (error) {
    render();
    toast(error.message || 'Unable to create a backup.', { kind: 'err', ms: 8000 });
  }
};
A.restoreWorkspaceBackup = el => {
  const id = el.dataset.id;
  const backup = (S.ui.backups || []).find(item => item.id === id);
  if (!backup || S.ui.currentUser?.role !== 'admin') return;
  confirmDlg({
    title: 'Restore backup?',
    body: `The current state will first be saved as a separate backup, then the data will be restored to the version from ${fmtTimestamp(backup.createdAt)}.`,
    ok: 'Restore',
    icon: 'history',
    run: async () => {
      try {
        await restoreWorkspaceBackup(id, S.ui.workspaceRevision);
        await refreshWorkspaceFromServer({ force: true });
        S.ui.modals = [];
        render();
        toast('Workspace restored from backup.');
        void A.loadWorkspaceBackups();
      } catch (error) {
        toast(error.message || 'Unable to restore the backup.', { kind: 'err', ms: 8000 });
      }
    },
  });
};
IN.importPortableWorkspace = async el => {
  const file = el.files?.[0];
  if (!file || S.ui.currentUser?.role !== 'admin') return;
  try {
    if (file.size > WORKSPACE_TRANSPORT_MAX_BYTES - 4096) throw new Error('The import file must be smaller than 4 MB.');
    const payload = JSON.parse(await file.text());
    if (jsonByteLength({ payload }) > WORKSPACE_TRANSPORT_MAX_BYTES - 4096) throw new Error('The import file must be smaller than 4 MB.');
    S.ui.importPreview = { payload, policy: 'copy', result: mergePortableWorkspace(D(), payload), busy: false };
    openModal({ type: 'portableImport' });
  } catch (error) {
    toast(error.message || 'The import file could not be read.', { kind: 'err', ms: 6000 });
  } finally {
    el.value = '';
  }
};
IN.importConflictPolicy = el => {
  const preview = S.ui.importPreview;
  preview.policy = el.value;
  preview.result = mergePortableWorkspace(D(), preview.payload, { conflictPolicy: preview.policy });
  render();
};
A.downloadImportReport = () => {
  const report = S.ui.importPreview?.result;
  if (!report) return;
  const url = URL.createObjectURL(
    new Blob([JSON.stringify({ counts: report.counts, report: report.report, files: S.ui.importPreview.entries }, null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = 'smena-import-report.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
};
A.confirmPortableImport = async () => {
  const preview = S.ui.importPreview;
  if (!preview || preview.busy || !['admin', 'editor'].includes(S.ui.currentUser?.role)) return;
  if (!['notes', 'links', 'knowledgeFolders', 'linkFolders'].some(key => preview.result.counts[key] > 0)) return;
  const owner = S.ui.currentUser.id;
  const workspace = D().ws.id || D().ws.url;
  preview.busy = true;
  S.ui.atomicOperation = true;
  render();
  try {
    if (!workspaceSyncIsClean(S.data)) {
      // Include pre-debounce edits (and legacy defaults materialized by the UI).
      // The atomic-operation guard keeps the reviewed batch stable while saving.
      save();
      await queueWorkspaceSync(S.data);
      if (!workspaceSyncIsClean(S.data)) throw new Error('Wait until all changes are saved before importing.');
    }
    if (owner !== S.ui.currentUser?.id || workspace !== (D().ws.id || D().ws.url)) throw new Error('The signed-in account changed. Sign in again.');
    const result = await commitPortableImport(preview.payload, S.ui.workspaceRevision, preview.policy);
    await refreshWorkspaceFromServer({ force: true });
    if (preview.entries) {
      Object.assign(S.ui, {
        knowledgeFolder: D().knowledgeFolders.some(folder => folder.id === preview.destination) ? preview.destination : 'root',
        knowledgeQuery: '',
        knowledgeTag: '',
        knowledgeOffset: 0,
        knowledgeFolderQuery: '',
      });
    }
    S.ui.migrationStatus = `Imported ${result.counts.notes} notes, ${result.counts.links} bookmarks, and ${result.counts.knowledgeFolders + result.counts.linkFolders} folders. Skipped ${result.counts.skipped} duplicates.`;
    if (S.ui.modals.at(-1)?.type === 'portableImport') S.ui.modals.pop();
    toast('Import complete. A recovery backup was saved.');
  } catch (error) {
    toast(error.message || 'The import file could not be read.', { kind: 'err', ms: 8000 });
  } finally {
    preview.busy = false;
    S.ui.atomicOperation = false;
    render();
  }
};
A.toggleSide = () => {
  S.ui.collapsed = !S.ui.collapsed;
  save();
  render();
};

/* ---------- knowledge base ---------- */
A.newKnowledgeNote = () => {
  mutate(() => {
    const { notes } = knowledgeCollections();
    const now = new Date().toISOString();
    const note = {
      id: uid('kn'),
      title: `${isRussian() ? 'Новая заметка' : 'New note'} ${notes.length + 1}`,
      category: 'General',
      summary: '',
      extracted_skills: [],
      tags: [],
      wikilinks: [],
      formatted_markdown: isRussian()
        ? '# Новая заметка\n\nДобавьте сюда знания, регламент или рабочие договорённости команды.'
        : '# New note\n\nAdd team knowledge, guidelines, or working agreements here.',
      folderId:
        S.ui.knowledgeFolder &&
        !['all', 'root', 'favorites'].includes(S.ui.knowledgeFolder) &&
        knowledgeCollections().folders.some(folder => folder.id === S.ui.knowledgeFolder)
          ? S.ui.knowledgeFolder
          : null,
      favorite: false,
      createdBy: D().me,
      updatedBy: D().me,
      createdAt: now,
      updatedAt: now,
    };
    notes.unshift(note);
    S.ui.knowledgeActive = null;
    S.ui.knowledgeDrawer = note.id;
    S.ui.knowledgeDrawerView = 'edit';
    S.ui.knowledgeQuery = '';
  });
};
export async function importKnowledgeFiles(files, folderId = S.ui.knowledgeFolder) {
  if (!files?.length || !['admin', 'editor'].includes(S.ui.currentUser?.role) || S.ui.knowledgeImportReading || knowledgeEditBlocked()) return;
  const owner = S.ui.currentUser.id;
  const workspace = D().ws.id || D().ws.url;
  const destination = knowledgeCollections().folders.some(folder => folder.id === folderId) ? folderId : null;
  S.ui.knowledgeImportReading = true;
  S.ui.knowledgeImportStatus = '';
  render();
  try {
    const { payload, entries } = await reviewKnowledgeImport(files, {
      idFactory: uid,
      memberId: D().me,
      folderId: destination,
      onProgress: (done, total) => {
        if (owner !== S.ui.currentUser?.id || workspace !== (D().ws.id || D().ws.url)) return;
        document.querySelector('[data-knowledge-import-progress]')?.replaceChildren(document.createTextNode(`${t('Reading note files…')} ${done} / ${total}`));
      },
    });
    if (owner !== S.ui.currentUser?.id || workspace !== (D().ws.id || D().ws.url)) return;
    S.ui.knowledgeMobileFolders = false;
    S.ui.importPreview = {
      payload,
      entries,
      destination,
      policy: 'copy',
      result: mergePortableWorkspace(D(), payload),
      busy: false,
    };
    openModal({ type: 'portableImport' });
  } catch (error) {
    if (owner === S.ui.currentUser?.id && workspace === (D().ws.id || D().ws.url)) {
      S.ui.knowledgeImportStatus = error instanceof Error ? error.message : 'Note files could not be imported.';
      toast(S.ui.knowledgeImportStatus, { kind: 'err', ms: 6000 });
    }
  } finally {
    S.ui.knowledgeImportReading = false;
    render();
  }
}
IN.importKnowledgeMarkdown = el => {
  const files = [...(el.files || [])];
  el.value = '';
  return importKnowledgeFiles(files);
};
A.openKnowledgeNote = el => {
  if (!S.ui.knowledgeDrawer) S.ui.knowledgeDrawerOpener = el.isConnected ? focusKey(el) : S.ui.knowledgeDrawerOpener;
  S.ui.knowledgeDrawer = el.dataset.id;
  S.ui.knowledgeDrawerView = 'preview';
  S.ui.knowledgeActive = null;
  if (el.classList.contains('knowledge-relation')) {
    S.ui.knowledgeQuery = '';
    S.ui.knowledgeFolder = 'all';
  }
  render();
  if (S.ui.knowledgeDrawer) {
    const drawer = $('.knowledge-drawer');
    if (drawer && !drawer.contains(document.activeElement)) drawer.focus({ preventScroll: true });
  }
};
A.previewKnowledgeNote = el => {
  if (!el.dataset.id) return;
  S.ui.knowledgeDrawer = el.dataset.id;
  S.ui.knowledgeDrawerView = 'preview';
  S.ui.knowledgeActive = null;
  S.ui.knowledgeDrawerOpener = el.isConnected ? focusKey(el) : S.ui.knowledgeDrawerOpener;
  render();
  const drawer = $('.knowledge-drawer');
  if (drawer) drawer.focus({ preventScroll: true });
};
A.goKnowledgeNote = el => {
  S.ui.knowledgeActive = null;
  S.ui.knowledgeDrawer = el.dataset.id;
  S.ui.knowledgeDrawerView = 'edit';
  S.ui.knowledgeQuery = '';
  S.ui.knowledgeFolder = 'all';
  go('knowledge');
};
A.setKnowledgePresentation = () => {
  // Kept for old deep links; the knowledge base now always uses panel view.
  S.ui.knowledgePresentation = 'drawer';
  render();
};
A.closeKnowledgeDrawer = () => {
  S.ui.knowledgeDrawer = null;
  render();
  if (!document.activeElement || document.activeElement === document.body) document.querySelector('[data-in="knowledgeQuery"]')?.focus();
};
A.editKnowledgeNote = () => {
  S.ui.knowledgeDrawerView = 'edit';
  render();
  document.getElementById('knowledge-title')?.focus();
};
A.toggleKnowledgeFavorite = el => {
  mutate(() => {
    const note = knowledgeCollections().notes.find(item => item.id === el.dataset.id);
    if (note) note.favorite = !note.favorite;
  });
};
A.setKnowledgeFolder = el => {
  S.ui.knowledgeOffset = 0;
  S.ui.knowledgeMobileFolders = false;
  S.ui.knowledgeDrawer = null;
  S.ui.knowledgeFolder = el.dataset.folder || 'all';
  S.ui.knowledgeRevealFolder = S.ui.knowledgeFolder;
  S.ui.knowledgeFolderCardQuery = '';
  S.ui.knowledgeFolderCardOffset = 0;
  S.ui.knowledgeActive = null;
  S.ui.knowledgeLimit = 200;
  S.ui.knowledgeTag = '';
  if (typeof window !== 'undefined' && window.innerWidth <= 640) {
    S.ui.knowledgeFolderNavOpen = false;
    S.ui.knowledgeFolderQuery = '';
  }
  if (S.ui.knowledgeFolder && !['all', 'root', 'favorites'].includes(S.ui.knowledgeFolder)) {
    const folders = knowledgeCollections().folders;
    const collapsed = { ...(S.ui.knowledgeCollapsedFolders || {}) };
    const byId = new Map(folders.map(folder => [folder.id, folder]));
    const seen = new Set();
    let current = byId.get(S.ui.knowledgeFolder);
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      delete collapsed[current.id];
      current = byId.get(current.parentId);
    }
    S.ui.knowledgeCollapsedFolders = collapsed;
  }
  render();
  // The mobile folder sheet disappears after navigation. Move focus to the
  // destination instead of leaving keyboard/screen-reader users on the body.
  if (typeof window !== 'undefined' && window.innerWidth <= 640) document.getElementById('knowledge-view-title')?.focus({ preventScroll: true });
};
A.toggleKnowledgeFolder = el => {
  const id = el.dataset.folder;
  if (!id) return;
  const collapsed = S.ui.knowledgeCollapsedFolders || {};
  S.ui.knowledgeCollapsedFolders = { ...collapsed, [id]: !collapsed[id] };
  render();
};
A.expandKnowledgeFolders = () => {
  S.ui.knowledgeCollapsedFolders = {};
  render();
};
A.toggleKnowledgeFolderNav = () => {
  S.ui.knowledgeFolderNavOpen = S.ui.knowledgeFolderNavOpen !== false ? false : true;
  render();
};
A.collapseKnowledgeFolders = () => {
  S.ui.knowledgeCollapsedFolders = Object.fromEntries(knowledgeCollections().folders.map(folder => [folder.id, true]));
  render();
};
A.clearKnowledgeTag = () => {
  S.ui.knowledgeOffset = 0;
  S.ui.knowledgeTag = '';
  S.ui.knowledgeActive = null;
  S.ui.knowledgeLimit = 200;
  render();
};
A.clearKnowledgeQuery = () => {
  S.ui.knowledgeOffset = 0;
  S.ui.knowledgeQuery = '';
  S.ui.knowledgeActive = null;
  S.ui.knowledgeLimit = 200;
  render();
};
A.loadMoreKnowledge = () => {
  S.ui.knowledgeLimit = Math.min(1000, (S.ui.knowledgeLimit || 200) + 200);
  render();
};
A.knowledgePage = el => {
  S.ui.knowledgeOffset = Math.max(0, Number(el.dataset.offset) || 0);
  render();
  document.querySelector('.knowledge-main')?.scrollTo(0, 0);
};
A.newKnowledgeFolder = el => {
  if (S.ui.currentUser?.role === 'viewer' || knowledgeEditBlocked()) return;
  const owner = S.ui.currentUser?.id,
    workspace = D().ws?.id;
  const requestedParent = el?.dataset?.parent ?? S.ui.knowledgeFolder;
  const parentId = knowledgeCollections().folders.some(folder => folder.id === requestedParent) ? requestedParent : null;
  openModal({
    type: 'prompt',
    title: 'New knowledge folder',
    label: 'Folder name',
    value: '',
    run: value => {
      if (knowledgeEditBlocked() || owner !== S.ui.currentUser?.id || workspace !== D().ws?.id) return;
      const name = value.trim();
      if (!name) return;
      mutate(() => {
        const { folders } = knowledgeCollections();
        if (parentId && !folders.some(folder => folder.id === parentId)) return toast('The destination folder no longer exists.', { kind: 'err' });
        if (folders.some(folder => (folder.parentId || null) === parentId && folder.name.toLowerCase() === name.toLowerCase()))
          return toast('A folder with this name already exists here.', { kind: 'err' });
        const folder = { id: uid('kf'), name, parentId, createdAt: new Date().toISOString() };
        folders.push(folder);
        S.ui.knowledgeFolder = folder.id;
        S.ui.knowledgeRevealFolder = folder.id;
        S.ui.knowledgeFolderCardQuery = '';
        S.ui.knowledgeFolderCardOffset = 0;
        S.ui.knowledgeMobileFolders = false;
      });
    },
  });
};
A.deleteKnowledgeNote = el => {
  const note = knowledgeCollections().notes.find(item => item.id === el.dataset.id);
  if (!note) return;
  confirmDlg({
    title: 'Delete note?',
    body: `<b>${esc(note.title)}</b> will be moved to trash.`,
    ok: 'Move to trash',
    danger: true,
    run: () =>
      mutate(() => {
        moveToTrash('note', note.title, { note: structuredClone(note) });
        D().knowledgeNotes = knowledgeCollections().notes.filter(item => item.id !== note.id);
        S.ui.knowledgeActive = D().knowledgeNotes[0]?.id || null;
        if (S.ui.knowledgeDrawer === note.id) S.ui.knowledgeDrawer = null;
      }),
  });
};
IN.knowledgeQuery = el => {
  S.ui.knowledgeOffset = 0;
  S.ui.knowledgeQuery = el.value;
  render();
  requestAnimationFrame(() => {
    const input = document.querySelector('[data-in="knowledgeQuery"]');
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  });
};
IN.knowledgeFolder = el => {
  S.ui.knowledgeFolder = el.value;
  S.ui.knowledgeActive = null;
  S.ui.knowledgeLimit = 200;
  S.ui.knowledgeTag = '';
  render();
};
IN.knowledgeFolderQuery = el => {
  S.ui.knowledgeFolderQuery = el.value;
  S.ui.knowledgeFolderNavOffset = 0;
  S.ui.knowledgeRevealFolder = null;
  render();
  requestAnimationFrame(() => {
    const input = document.querySelector('[data-in="knowledgeFolderQuery"]');
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  });
};
IN.knowledgeSort = el => {
  S.ui.knowledgeOffset = 0;
  S.ui.knowledgeSort = el.value === 'title' ? 'title' : 'updated';
  S.ui.knowledgeActive = null;
  render();
};
IN.knowledgeTag = el => {
  S.ui.knowledgeOffset = 0;
  S.ui.knowledgeTag = el.value || '';
  S.ui.knowledgeActive = null;
  S.ui.knowledgeLimit = 200;
  render();
};
A.setKnowledgeTag = el => {
  S.ui.knowledgeTag = el.dataset.tag || '';
  S.ui.knowledgeActive = null;
  S.ui.knowledgeLimit = 200;
  render();
};
A.renameKnowledgeFolder = el => {
  if (S.ui.currentUser?.role === 'viewer' || knowledgeEditBlocked()) return;
  const owner = S.ui.currentUser?.id,
    workspace = D().ws?.id;
  const folder = knowledgeCollections().folders.find(item => item.id === el.dataset.folder);
  if (!folder) return;
  openModal({
    type: 'prompt',
    title: 'Rename knowledge folder',
    label: 'Folder name',
    value: folder.name,
    run: value => {
      if (knowledgeEditBlocked() || owner !== S.ui.currentUser?.id || workspace !== D().ws?.id) return;
      const name = value.trim();
      const current = knowledgeCollections().folders.find(item => item.id === folder.id);
      if (!current) return toast('This folder changed. Reopen its actions.', { kind: 'info' });
      if (!name || name === current.name) return;
      mutate(() => {
        const result = renameKnowledgeFolderData(knowledgeCollections().folders, current.id, name);
        if (!result.ok) toast('A folder with this name already exists here.', { kind: 'err' });
      });
    },
  });
};
A.deleteKnowledgeFolder = el => {
  if (S.ui.currentUser?.role === 'viewer' || knowledgeEditBlocked()) return;
  const owner = S.ui.currentUser?.id,
    workspace = D().ws?.id;
  const { folders, notes } = knowledgeCollections();
  const folder = folders.find(item => item.id === el.dataset.folder);
  if (!folder) return;
  const childCount = folders.filter(item => item.parentId === folder.id).length;
  const noteCount = notes.filter(note => note.folderId === folder.id).length;
  confirmDlg({
    title: 'Delete knowledge folder?',
    body: `<b>${esc(folder.name)}</b> will be removed. ${noteCount || childCount ? 'Notes and subfolders will move to its parent.' : ''}`,
    ok: 'Delete folder',
    danger: true,
    run: () => {
      if (knowledgeEditBlocked() || owner !== S.ui.currentUser?.id || workspace !== D().ws?.id) return;
      mutate(() => {
        const result = deleteKnowledgeFolderData(D(), folder.id, D().me);
        if (!result.ok)
          return toast(
            result.reason === 'collision' ? 'Rename conflicting subfolders before deleting this folder.' : 'This folder changed. Reopen its actions.',
            { kind: 'err' },
          );
        if (S.ui.knowledgeFolder === folder.id) S.ui.knowledgeFolder = result.parentId || 'all';
        S.ui.knowledgeFolderCardOffset = 0;
        S.ui.knowledgeActive = null;
      });
    },
  });
};
IN.knowledgeField = el => {
  if (S.ui.currentUser?.role === 'viewer' || knowledgeEditBlocked()) return;
  const note = knowledgeCollections().notes.find(item => item.id === el.dataset.id);
  if (!note) return;
  bindWikiReferences(D().knowledgeNotes);
  const field = el.dataset.field;
  const before = field === 'tags' ? (note.tags || []).join(', ') : note[field] || '';
  if (before === el.value) return;
  // Preserve recognized legacy provenance on an actual edit, before changing
  // its corroborating fields. Reading alone never migrates notes.
  if (!note.sourceFormat && knowledgeDisplayParts(note).metadata) note.sourceFormat = 'markdown';
  if (field === 'tags')
    note.tags = [
      ...new Set(
        el.value
          .split(',')
          .map(value => value.trim())
          .filter(Boolean),
      ),
    ];
  else note[field] = el.value || (field === 'folderId' ? null : '');
  if (field === 'formatted_markdown') note.wikilinks = extractWikiLinks(note.formatted_markdown);
  if (field === 'formatted_markdown') bindWikiReferences(D().knowledgeNotes);
  note.updatedAt = new Date().toISOString();
  note.updatedBy = D().me;
  S.ui.knowledgeDirty = true;
  save();
  updateKnowledgeSaveStatus();
  if (el.matches('select')) render();
};
BLUR.knowledgeField = el => {
  IN.knowledgeField(el);
  // Let the browser finish focusing/clicking the next control before replacing the editor DOM.
  requestAnimationFrame(() => {
    if (!document.activeElement?.closest('.knowledge-editor')) render();
  });
};

/* ---------- shared bookmarks ---------- */
async function hydrateRelatedFiles(keys) {
  const ids = keys.filter(key => key.startsWith('file:') && !resolveGraphEntity(D(), key)).map(key => key.slice(5));
  if (!ids.length) return true;
  const session = getSessionGeneration();
  const route = JSON.stringify([S.ui.route, S.ui.params]),
    modal = S.ui.modals.at(-1);
  try {
    await (await import('../features/file-catalog-demand.js')).ensureFileIdentities(ids);
    return session === getSessionGeneration() && route === JSON.stringify([S.ui.route, S.ui.params]) && modal === S.ui.modals.at(-1);
  } catch {
    if (session === getSessionGeneration()) toast('Unable to load files. Check connection and retry.');
    return false;
  }
}
A.addRelationPicker = async el => {
  const key = el.dataset.key;
  if (!(await hydrateRelatedFiles([key]))) return;
  if (!entityAllowed(D(), key, graphOptions(), true)) return;
  openModal({ type: 'relations', source: key, query: '', kind: '', relationType: 'related' });
};
A.resolveWikiReference = el => {
  if (!entityAllowed(D(), el.dataset.key, graphOptions(), true)) return;
  openModal({ type: 'relations', source: el.dataset.key, query: '', kind: 'note', relationType: 'source', wikiLabel: el.dataset.label });
};
IN.relationQuery = el => {
  S.ui.modals.at(-1).query = el.value;
  render();
};
IN.relationKind = el => {
  S.ui.modals.at(-1).kind = el.value;
  render();
};
IN.relationType = el => {
  S.ui.modals.at(-1).relationType = el.value;
};
A.createRelation = async el => {
  const modal = S.ui.modals.at(-1);
  if (modal?.type !== 'relations' || !Object.hasOwn(RELATION_TYPES, modal.relationType)) return;
  const from = modal.source,
    to = el.dataset.key;
  if (!(await hydrateRelatedFiles([from, to])) || S.ui.modals.at(-1) !== modal) return;
  if (from === to || ![from, to].every(key => entityAllowed(D(), key, graphOptions(), true))) return;
  if (modal.wikiLabel && (!from.startsWith('note:') || !to.startsWith('note:'))) return;
  mutate(() => {
    if (modal.wikiLabel) {
      const note = resolveGraphEntity(D(), from).item;
      bindWikiReferences(D().knowledgeNotes);
      const reference = note.wikiRefs?.find(ref => ref.label === modal.wikiLabel);
      if (reference) reference.target = resolveGraphEntity(D(), to).id;
      S.ui.modals.pop();
      return;
    }
    D().relations ||= [];
    if (!D().relations.some(edge => !edge.deletedAt && edge.from === from && edge.to === to && edge.type === modal.relationType))
      D().relations.push({ id: uid('rel'), from, to, type: modal.relationType, createdBy: D().me, createdAt: new Date().toISOString() });
    S.ui.modals.pop();
  });
};
A.removeRelation = async el => {
  let edge = D().relations?.find(item => item.id === el.dataset.id);
  if (!edge || !(await hydrateRelatedFiles([edge.from, edge.to]))) return;
  edge = D().relations?.find(item => item.id === el.dataset.id);
  if (!edge || ![edge.from, edge.to].every(key => entityAllowed(D(), key, graphOptions(), true))) return;
  mutate(() => {
    edge.deletedAt = new Date().toISOString();
  });
};
A.openRelatedEntity = async el => {
  const key = el.dataset.key;
  if (!(await hydrateRelatedFiles([key]))) return;
  if (!entityAllowed(D(), key, graphOptions())) return;
  const entity = resolveGraphEntity(D(), key);
  S.ui.modals = [];
  S.ui.drawer = null;
  if (entity.kind === 'note') A.goKnowledgeNote({ dataset: { id: entity.id } });
  else if (entity.kind === 'bookmark') A.goBookmark({ dataset: { id: entity.id } });
  else if (entity.kind === 'file') A.previewFile({ dataset: { id: entity.id } });
  else if (entity.kind === 'task') A.openTask({ dataset: { id: entity.id } });
  else go('project', { id: entity.id });
};
A.showGraph = async el => (await import('../features/graph-actions.js')).showGraph(el);
A.searchInGraph = async () => (await import('../features/graph-actions.js')).searchInGraph();
A.exportGraph = async () => (await import('../features/graph-export.js')).exportGraph();
A.newBookmark = () => {
  S.ui.bookmarkEditing = null;
  S.ui.bookmarkDraft = emptyBookmarkDraft(S.ui.bookmarkFolder !== 'all' && S.ui.bookmarkFolder !== 'root' ? S.ui.bookmarkFolder : '');
  S.ui.bookmarkForm = true;
  render();
  requestAnimationFrame(() => document.getElementById('bookmark-url')?.focus());
};
A.closeBookmarkForm = () => {
  S.ui.bookmarkForm = false;
  S.ui.bookmarkEditing = null;
  S.ui.bookmarkDraft = emptyBookmarkDraft();
  render();
};
A.editBookmark = el => {
  const link = bookmarkCollections().links.find(item => item.id === el.dataset.id);
  if (!link || S.ui.currentUser?.role === 'viewer') return;
  S.ui.bookmarkEditing = link.id;
  S.ui.bookmarkDraft = {
    url: link.url || '',
    title: link.title || '',
    description: link.description || '',
    folder: link.folder || '',
    tags: (link.tags || []).join(', '),
    importance: link.importance || 'medium',
  };
  S.ui.bookmarkForm = true;
  render();
  requestAnimationFrame(() => document.getElementById('bookmark-title')?.focus());
};
A.saveBookmark = () => {
  if (S.ui.currentUser?.role === 'viewer') return;
  if (S.ui.bookmarkEditing && !bookmarkCollections().links.some(link => link.id === S.ui.bookmarkEditing)) {
    toast('This bookmark no longer exists. Refresh the list and try again.', { kind: 'error' });
    return;
  }
  const draft = S.ui.bookmarkDraft;
  const parsed = normalizedBookmarkUrl(draft.url);
  if (!parsed) {
    toast('Enter a valid HTTP or HTTPS URL.', { kind: 'error' });
    document.getElementById('bookmark-url')?.focus();
    return;
  }
  const tags = [
    ...new Set(
      String(draft.tags || '')
        .split(',')
        .map(value => value.trim().toLowerCase().replace(/^#/, ''))
        .filter(Boolean),
    ),
  ];
  mutate(() => {
    const { links } = bookmarkCollections();
    const now = new Date().toISOString();
    const values = {
      url: parsed.toString(),
      title: draft.title.trim() || parsed.hostname.replace(/^www\./, ''),
      description: draft.description.trim(),
      site_name: parsed.hostname.replace(/^www\./, ''),
      preview_image: '',
      favicon_url: '',
      folder: draft.folder || '',
      importance: IMPORTANCE_LEVELS.has(draft.importance) ? draft.importance : 'medium',
      tags,
      updated_at: now,
    };
    const existing = links.find(item => item.id === S.ui.bookmarkEditing);
    if (existing) Object.assign(existing, values);
    else
      links.unshift({
        id: uid('ln'),
        ...values,
        is_archived: false,
        is_read: false,
        health_status: 'unknown',
        created_at: now,
      });
    S.ui.bookmarkForm = false;
    S.ui.bookmarkEditing = null;
    S.ui.bookmarkDraft = emptyBookmarkDraft();
    Object.assign(S.ui, savedBookmarkView(existing || { ...values, is_archived: false }, S.ui.bookmarkFolder));
  });
};
A.newBookmarkFolder = () => {
  if (S.ui.currentUser?.role === 'viewer') return;
  openModal({
    type: 'prompt',
    title: 'New bookmark folder',
    label: 'Folder name',
    value: '',
    run: value => {
      const name = value.trim();
      if (!name) return;
      mutate(() => {
        const { folders } = bookmarkCollections();
        const existing = folders.find(folder => folder.name.toLowerCase() === name.toLowerCase());
        if (existing) {
          S.ui.bookmarkFolder = existing.id;
          return;
        }
        const palette = ['#8B5CF6', '#06B6D4', '#10B981', '#F59E0B', '#EF4444', '#EC4899'];
        const folder = { id: uid('lf'), name, parent_id: null, color: palette[folders.length % palette.length], created_at: new Date().toISOString() };
        folders.push(folder);
        S.ui.bookmarkFolder = folder.id;
      });
    },
  });
};
A.toggleBookmarkRead = el => {
  mutate(() => {
    const link = bookmarkCollections().links.find(item => item.id === el.dataset.id);
    if (link) {
      link.is_read = !link.is_read;
      link.updated_at = new Date().toISOString();
    }
  });
};
A.toggleBookmarkArchive = el => {
  mutate(() => {
    const link = bookmarkCollections().links.find(item => item.id === el.dataset.id);
    if (link) {
      link.is_archived = !link.is_archived;
      link.updated_at = new Date().toISOString();
    }
  });
};
A.copyBookmark = el => {
  const link = bookmarkCollections().links.find(item => item.id === el.dataset.id);
  if (link) copy(link.url, 'Link copied');
};
A.goBookmark = el => {
  const link = bookmarkCollections().links.find(item => item.id === el.dataset.id);
  if (!link) return;
  S.ui.bookmarkQuery = link.title || link.url;
  S.ui.bookmarkFolder = 'all';
  S.ui.bookmarkScope = link.is_archived ? 'archived' : 'active';
  go('bookmarks');
};
A.deleteBookmark = el => {
  const link = bookmarkCollections().links.find(item => item.id === el.dataset.id);
  if (!link) return;
  confirmDlg({
    title: 'Delete bookmark?',
    body: `<b>${esc(link.title)}</b> will be moved to trash.`,
    ok: 'Move to trash',
    danger: true,
    run: () =>
      mutate(() => {
        moveToTrash('bookmark', link.title, { link: structuredClone(link) });
        D().links = bookmarkCollections().links.filter(item => item.id !== link.id);
      }),
  });
};
IN.bookmarkQuery = el => {
  S.ui.bookmarkQuery = el.value;
  render();
  requestAnimationFrame(() => {
    const input = document.querySelector('[data-in="bookmarkQuery"]');
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  });
};
IN.bookmarkFolder = el => {
  S.ui.bookmarkFolder = el.value;
  render();
};
IN.bookmarkDraft = el => {
  S.ui.bookmarkDraft[el.dataset.field] = el.value;
};
A.openMnav = () => {
  S.ui.mnav = true;
  render();
};
A.closeMnav = () => {
  S.ui.mnav = false;
  render();
};
A.toggleExpand = el => {
  S.ui.expanded[el.dataset.id] = !S.ui.expanded[el.dataset.id];
  render();
};
A.goTasks = el => {
  const f = el.dataset.f;
  const v = viewOf('tasks');
  v.mode = 'list';
  v.filters =
    f === 'open'
      ? [{ f: 'status', op: 'not', v: ['done'] }]
      : f === 'done'
        ? [
            { f: 'status', op: 'is', v: ['done'] },
            { f: 'updated', op: 'is', v: ['7'] },
          ]
        : f === 'overdue'
          ? [{ f: 'due', op: 'is', v: ['overdue'] }]
          : [];
  go('tasks');
};
A.goFilteredList = el => {
  const v = viewOf('p:' + el.dataset.id);
  v.filters = [{ f: 'status', op: 'is', v: [el.dataset.st] }];
  v.group = 'status';
  go('project', { id: el.dataset.id, tab: 'list' }, { tab: true });
};

/* ---------- theme ---------- */
A.setTheme = el => {
  S.prefs.theme = el.dataset.v;
  save();
  render();
};
A.toggleDark = () => {
  S.prefs.theme = effectiveDark() ? 'light' : 'dark';
  save();
  S.ui.palette = null;
  render();
  toast(effectiveDark() ? 'Dark mode on' : 'Light mode on', { kind: 'info', ms: 1800 });
};
A.setPref = el => {
  S.prefs[el.dataset.k] = el.dataset.v;
  save();
  render();
};

/* ---------- popovers ---------- */
A.pop = el => {
  const d = el.dataset;
  const p = S.ui.pop;
  if (p && p.type === d.pop && p.id === d.id && p.key === d.key && p.i == (d.i != null ? +d.i : undefined) && p.field === d.field) {
    closePop();
    return;
  }
  openPop(el);
  if (d.pop === 'user') void refreshSystemStatus();
};

A.toggleSystemDetails = () => {
  S.ui.systemDetailsOpen = !S.ui.systemDetailsOpen;
  render();
  if (S.ui.systemDetailsOpen && !S.ui.systemStatus && !S.ui.systemStatusLoading) void refreshSystemStatus();
};

A.syncSystemNow = async () => {
  if (S.ui.systemSyncing) return;
  S.ui.systemSyncing = true;
  render();
  try {
    await queueWorkspaceSync(D());
    await retryWorkspaceSync();
    const result = await refreshWorkspaceFromServer();
    if (result.status === 'current' || result.status === 'updated') {
      S.ui.offline = false;
      S.ui.syncUnavailable = false;
      S.ui.syncState = 'saved';
      S.ui.lastSyncedAt = Date.now();
    }
    await refreshSystemStatus();
    toast(result.status === 'updated' ? 'Team updates loaded.' : 'Synchronization complete.', { kind: 'ok' });
  } catch (error) {
    S.ui.systemStatusError = error.message || 'Synchronization failed.';
    toast(S.ui.systemStatusError, { kind: 'err', ms: 8000 });
  } finally {
    S.ui.systemSyncing = false;
    if (S.ui.pop?.type === 'user') render();
  }
};
A.ctxBtn = el => {
  const r = el.getBoundingClientRect();
  const d = el.dataset;
  const p = S.ui.pop;
  if (p && p.type === 'ctx' && p.id === d.id && p.ctx === d.ctx) {
    closePop();
    return;
  }
  S.ui.pop = { type: 'ctx', ctx: d.ctx, id: d.id, key: d.key, vid: d.vid, x: r.left, y: r.bottom + 4, top: r.top, w: r.width };
  render();
};
A.popPick = el => {
  const p = S.ui.pop;
  let v = el.dataset.v;
  if (p.type === 'subassignee' || (p.type === 'date' && p.field === 'subdue')) {
    const t = task(p.id);
    const sb = t?.subtasks[p.i];
    if (!sb) return;
    const k = p.type === 'subassignee' ? 'assignee' : 'due';
    v = v || null;
    S.ui.pop = null;
    mutate(() => {
      sb[k] = v;
      logAct(
        k === 'assignee' ? 'assigned a subtask on' : 'set a subtask due date on',
        t,
        k === 'assignee' ? (v ? `to ${mem(v).name}` : '(unassigned)') : v ? fmtDate(v) : '(cleared)',
      );
    });
    return;
  }
  if (p.type === 'pstatus') {
    const pr = proj(p.id);
    mutate(() => {
      pr.status = v;
      D().activity.unshift({
        id: uid('a'),
        by: D().me,
        verb: 'changed status of project',
        task: null,
        project: pr.id,
        at: Date.now(),
        extra: 'to ' + PSTAT[v].name,
      });
    });
    S.ui.pop = null;
    render();
    toast(`${pr.name} marked ${PSTAT[v].name}`);
    return;
  }
  if (p.type === 'role') {
    if (S.ui.currentUser?.role !== 'admin') {
      window.dispatchEvent(new CustomEvent('smena:permission-denied', { detail: { fields: ['members'], role: S.ui.currentUser?.role } }));
      return;
    }
    const m = mem(p.id);
    if (!m || m.id === D().me || m.role === 'Owner') return;
    if (isWorkspaceAdministrator(m) && v !== 'Admin' && activeWorkspaceAdministrators(D()).length <= 1) {
      S.ui.pop = null;
      render();
      toast("Assign another administrator before changing the last administrator's role.", { kind: 'err', ms: 7000 });
      return;
    }
    mutate(() => {
      m.role = v;
    });
    S.ui.pop = null;
    render();
    toast(`${m.name} is now ${v === 'Admin' ? 'an' : 'a'} ${v}`);
    return;
  }
  const field = { status: 'status', priority: 'priority', assignee: 'assignee', project: 'project', recur: 'recur', estimate: 'estimate', date: p.field }[
    p.type
  ];
  if (!field) return;
  if (field === 'assignee' && !v) v = null;
  if (field === 'recur' && v === 'Does not repeat') v = null;
  if ((field === 'estimate' || field === 'due' || field === 'start') && !v) v = null;
  S.ui.pop = null;
  const patch = { [field]: v };
  if (field === 'due' && v && p.id !== '__form') {
    const t = task(p.id);
    if (t.start && t.start > v) patch.start = v;
  }
  updateTask(p.id, patch);
};
A.popToggleLabel = el => {
  const p = S.ui.pop;
  const t = tgt(p);
  const v = el.dataset.v;
  const labels = t.labels.includes(v) ? t.labels.filter(x => x !== v) : [...t.labels, v];
  updateTask(p.id, { labels });
};
A.popToggleDep = el => {
  const p = S.ui.pop;
  const t = task(p.id);
  const v = el.dataset.v;
  updateTask(p.id, { deps: t.deps.includes(v) ? t.deps.filter(x => x !== v) : [...t.deps, v] });
};
A.popMonth = el => {
  const p = S.ui.pop;
  const m = parse(p.m);
  p.m = iso(new Date(m.getFullYear(), m.getMonth() + +el.dataset.d, 1));
  render();
};
IN.popQ = el => {
  if (S.ui.pop) {
    S.ui.pop.q = el.value;
    render();
  }
};
export const ctxTo = type => () => {
  S.ui.pop = { ...S.ui.pop, type, q: '' };
  if (type === 'date') S.ui.pop.m = iso(TODAY);
  render();
};
A.ctxStatus = ctxTo('status');
A.ctxAssign = ctxTo('assignee');
A.ctxPrio = ctxTo('priority');
A.ctxMove = ctxTo('project');
A.ctxRole = ctxTo('role');

/* ---------- tasks ---------- */
A.openTask = el => {
  const id = el.dataset.id;
  if (!task(id)) return;
  if (!canSee(proj(task(id).project))) {
    toast("You don't have access to that task", { kind: 'err' });
    return;
  }
  if (!S.ui.drawer || !document.activeElement?.closest?.('.drawer')) S.ui.drawerOpener = el.isConnected ? focusKey(el) : S.ui.drawerOpener;
  S.ui.drawer = id;
  S.ui.drawerFull = S.prefs.openTasks === 'full' || (S.ui.drawerFull && S.ui.drawer === id);
  S.ui.pop = null;
  S.ui.palette = null;
  S.ui.modals = [];
  S.ui.mention = null;
  S.ui.subOpen = null;
  S.ui.drawerTab = S.ui.drawerTab || 'comments';
  render();
  const dr = $('.drawer');
  if (dr && !dr.contains(document.activeElement)) dr.focus({ preventScroll: true });
};
A.closeDrawer = () => {
  S.ui.drawer = null;
  S.ui.drawerFull = false;
  S.ui.subOpen = null;
  render();
};
A.skipToContent = () => {
  const c = $('#main-content');
  c?.focus();
};
A.projUp = el => A._projMove(el, -1);
A.projDown = el => A._projMove(el, 1);
A._projMove = (el, d) => {
  const vis = visibleProjects().map(p => p.id);
  const i = vis.indexOf(el.dataset.id);
  const j = i + d;
  if (j < 0 || j >= vis.length) return;
  const o = D().projOrder;
  const a = o.indexOf(vis[i]),
    b = o.indexOf(vis[j]);
  [o[a], o[b]] = [o[b], o[a]];
  S.ui.pop = null;
  save();
  render();
  toast(`Moved ${proj(el.dataset.id).name} ${d < 0 ? 'up' : 'down'}`, { ms: 1600 });
};
A.toggleDrawerFull = () => {
  S.ui.drawerFull = !S.ui.drawerFull;
  render();
};
A.toggleDone = el => {
  const t = task(el.dataset.id);
  if (!t) return;
  const wasDone = t.status === 'done';
  S.ui.pop = null;
  updateTask(t.id, { status: wasDone ? (t.prevStatus && t.prevStatus !== 'done' ? t.prevStatus : 'todo') : 'done' });
  if (!wasDone && !S.ui.offline) toast(`Completed “${t.title}”`, { action: 'Undo', onAction: () => updateTask(t.id, { status: t.prevStatus || 'todo' }) });
};
A.toggleFavTask = el => {
  const t = task(el.dataset.id);
  mutate(() => {
    t.fav = !t.fav;
  });
  S.ui.pop = null;
  toast(t.fav ? 'Added to favorites' : 'Removed from favorites', { ms: 1800 });
  render();
};
A.toggleFavProj = el => {
  const p = proj(el.dataset.id);
  mutate(() => {
    p.fav = !p.fav;
  });
  S.ui.pop = null;
  render();
  toast(p.fav ? `Added ${p.name} to favorites` : 'Removed from favorites', { ms: 1800 });
};
A.copyLink = el => {
  S.ui.pop = null;
  render();
  const d = el.dataset;
  const linkedFile = d.fid || (d.id && D().files.some(file => file.id === d.id) ? d.id : '');
  const path =
    d.id && task(d.id)
      ? `task/${encodeURIComponent(entityRouteKey(D().tasks, task(d.id)))}`
      : d.pid
        ? `project/${encodeURIComponent(entityRouteKey(D().projects, proj(d.pid)))}`
        : linkedFile
          ? `file/${linkedFile}`
          : d.id && proj(d.id)
            ? `project/${encodeURIComponent(entityRouteKey(D().projects, proj(d.id)))}`
            : '';
  copy(workspaceHref(D().ws.url, path));
};
A.copyText = el => copy(el.dataset.text, 'Copied to clipboard');
A.copyEmail = el => {
  S.ui.pop = null;
  render();
  copy(mem(el.dataset.id).email, 'Email copied');
};
A.dupTask = el => {
  const t = task(el.dataset.id);
  S.ui.pop = null;
  let n;
  mutate(() => {
    n = createTask({ ...JSON.parse(JSON.stringify(t)), id: uid('t'), key: undefined, title: t.title + ' (copy)', created: Date.now(), fav: false });
    n.key = nextKey(proj(n.project));
  });
  toast('Task duplicated', { action: 'Open', onAction: () => A.openTask({ dataset: { id: n.id } }) });
};
A.archiveTask = el => {
  const t = task(el.dataset.id);
  const snap = snapshot();
  S.ui.pop = null;
  if (S.ui.drawer === t.id) S.ui.drawer = null;
  mutate(() => {
    t.archived = true;
    t.archivedAt = Date.now();
    logAct('archived', t);
  });
  toast(`Archived “${t.title}”`, { action: 'Undo', onAction: () => restore(snap) });
};
export function moveToTrash(kind, name, data) {
  D().trash = D().trash || [];
  D().trash.unshift({ id: uid('trash'), kind, name, deletedAt: Date.now(), deletedBy: D().me, data });
}
export function deleteTasks(ids, toTrash = true) {
  const set = new Set(ids);
  if (toTrash) {
    D()
      .tasks.filter(t => set.has(t.id))
      .forEach(t => {
        const comments = D().comments.filter(comment => comment.task === t.id);
        const files = D().files.filter(file => file.task === t.id);
        const dependentTaskIds = D()
          .tasks.filter(candidate => (candidate.deps || []).includes(t.id))
          .map(candidate => candidate.id);
        moveToTrash('task', t.title, { task: structuredClone(t), comments: structuredClone(comments), files: structuredClone(files), dependentTaskIds });
      });
  }
  D().tasks = D().tasks.filter(t => !set.has(t.id));
  D().tasks.forEach(t => (t.deps = t.deps.filter(d => !set.has(d))));
  D().comments = D().comments.filter(c => !set.has(c.task));
  D().files = D().files.filter(file => !set.has(file.task));
  if (set.has(S.ui.drawer)) S.ui.drawer = null;
  ids.forEach(i => S.ui.sel.delete(i));
}
A.delTask = el => {
  const t = task(el.dataset.id);
  S.ui.pop = null;
  if (!t) return;
  const run = () => {
    const snap = snapshot();
    if (mutate(() => deleteTasks([t.id]))) toast(`“${t.title}” moved to trash`, { action: 'Undo', onAction: () => restore(snap) });
  };
  if (S.prefs.confirmDel === false && !el.dataset.demo) return run();
  confirmDlg({
    title: 'Delete task?',
    body: `<b>${esc(t.title)}</b>${t.subtasks.length ? `, its ${t.subtasks.length} subtasks,` : ''} and ${commentsOf(t.id).length} comment${commentsOf(t.id).length === 1 ? '' : 's'} will be moved to the trash.`,
    ok: 'Move to trash',
    danger: true,
    run,
  });
};
A.editTask = el => {
  const t = task(el.dataset.id);
  if (!t) return;
  S.ui.form = {
    title: t.title,
    desc: (t.desc || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
    project: t.project,
    status: t.status,
    assignee: t.assignee,
    priority: t.priority,
    due: t.due,
    start: t.start,
    labels: [...t.labels],
    subtasks: t.subtasks.map(s => ({ ...s })),
    files: [],
    recur: t.recur,
    more: false,
  };
  S.ui.errors = {};
  openModal({ type: 'task', edit: t.id });
};
A.newTask = el => {
  const d = el?.dataset || {};
  const pid =
    d.project ||
    curProjectId() ||
    projectFromKey(S.ui.composer?.ctx) ||
    (S.ui.drawer && task(S.ui.drawer)?.project) ||
    visibleProjects().find(p => canSee(p) && p.status !== 'complete')?.id;
  S.ui.form = {
    title: '',
    desc: '',
    project: canSee(proj(pid)) ? pid : 'p1',
    status: 'todo',
    assignee: d.assignee || D().me,
    priority: 'medium',
    due: d.due || null,
    start: null,
    labels: [],
    subtasks: [],
    files: [],
    recur: null,
    more: S.ui.form?.more || false,
  };
  S.ui.errors = {};
  openModal({ type: 'task' });
};
IN.form = el => {
  S.ui.form[el.dataset.f] = el.value;
  if (el.dataset.f === 'title' && S.ui.errors.title && el.value.trim()) {
    S.ui.errors.title = null;
    render();
  }
};
IN.formMore = el => {
  S.ui.form.more = el.checked;
};
IN.formFiles = el => {
  [...el.files].forEach(f => S.ui.form.files.push({ name: f.name, size: fsize(f.size), type: fileType(f.name) }));
  render();
};
KEY.formAddSub = el => {
  const v = el.value.trim();
  if (!v) return;
  S.ui.form.subtasks.push({ id: uid('s'), title: v, done: false });
  render();
  setTimeout(() => $('#f-sub')?.focus(), 0);
};
A.formRmSub = el => {
  S.ui.form.subtasks.splice(+el.dataset.i, 1);
  render();
};
A.formRmFile = el => {
  S.ui.form.files.splice(+el.dataset.i, 1);
  render();
};
A.submitTask = () => {
  const m = S.ui.modals[S.ui.modals.length - 1];
  const f = S.ui.form;
  const title = ($('#f-title')?.value ?? f.title).trim();
  f.title = title;
  f.desc = $('#f-desc')?.value ?? f.desc;
  if (!title) {
    S.ui.errors.title = 'Give the task a name';
    render();
    $('#f-title')?.focus();
    return;
  }
  S.ui.errors = {};
  const files = f.files.map(x => ({ id: uid('a'), name: x.name, type: x.type, size: x.size, by: D().me, at: Date.now() }));
  const base = {
    title,
    project: f.project,
    status: f.status,
    assignee: f.assignee,
    priority: f.priority,
    due: f.due,
    start: f.start && f.due && f.start > f.due ? f.due : f.start,
    labels: f.labels,
    recur: f.recur,
    subtasks: f.subtasks,
  };
  if (m.edit) {
    const t = task(m.edit);
    if (
      !mutate(() => {
        applyPatch(t, base);
        if (
          f.desc !==
          (t.desc || '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
        )
          t.desc = f.desc ? `<p>${esc(f.desc)}</p>` : '';
        t.attachments.push(...files);
      })
    )
      return;
    S.ui.modals.pop();
    render();
    toast('Changes saved');
    return;
  }
  let t;
  if (
    !mutate(() => {
      t = createTask({ ...base, desc: f.desc ? `<p>${esc(f.desc)}</p>` : '', attachments: files });
      files.forEach(x => D().files.unshift({ ...x, project: t.project, task: t.id }));
    })
  )
    return;
  if (f.more) {
    Object.assign(f, { title: '', desc: '', subtasks: [], files: [] });
    render();
    setTimeout(() => $('#f-title')?.focus(), 0);
    toast(`Created ${t.key}`, { ms: 2000 });
    return;
  }
  S.ui.modals.pop();
  fxSet({ added: t.id });
  render();
  toast(`Created ${t.key} in ${proj(t.project).name}`, { action: 'Open', onAction: () => A.openTask({ dataset: { id: t.id } }) });
};

/* inline composer */
A.startComposer = el => {
  S.ui.composer = { ctx: el.dataset.ctx, group: el.dataset.group, gb: JSON.parse(el.dataset.gb || '{}') };
  S.ui.pop = null;
  render();
  setTimeout(() => $('#composer-in')?.focus(), 0);
};
A.cancelComposer = () => {
  S.ui.composer = null;
  render();
};
KEY.commitComposer = () => A.commitComposer();
A.commitComposer = () => {
  const c = S.ui.composer;
  const el = $('#composer-in');
  const v = el?.value.trim();
  if (!c) return;
  if (!v) {
    A.cancelComposer();
    return;
  }
  const f = { title: v, ...c.gb };
  f.project = f.project || projectFromKey(c.ctx) || curProjectId() || 'p1';
  if (c.ctx === 'mytasks') f.assignee = D().me;
  mutate(() => createTask(f));
  setTimeout(() => $('#composer-in')?.focus(), 0);
};
KEY.commitTitle = el => DBL._commitTitle(el);
DBL.editTitle = el => {
  const row = el.closest('[data-task-row]');
  if (!row) return;
  S.ui.drawer = null;
  S.ui.editCell = { id: row.dataset.taskRow, f: 'title' };
  render();
  const i = $('#edit-title');
  if (i) {
    i.focus();
    i.select();
  }
};
DBL._commitTitle = el => {
  const c = S.ui.editCell;
  if (!c) return;
  S.ui.editCell = null;
  const v = el.value.trim();
  if (v && v !== task(c.id).title) updateTask(c.id, { title: v });
  else render();
};
DBL.editCell = el => {
  S.ui.drawer = null;
  S.ui.editCell = { id: el.dataset.id || el.closest('[data-id]').dataset.id, f: el.dataset.f };
  render();
  const i = $('#edit-cell');
  if (i) {
    i.focus();
    i.select();
  }
};
A.editCell = el => DBL.editCell(el);
KEY.commitCell = el => {
  const c = S.ui.editCell;
  if (!c) return;
  S.ui.editCell = null;
  const v = el.value.trim();
  if (c.f === 'title' && !v) {
    render();
    return;
  }
  updateTask(c.id, { [c.f]: v || null });
};
BLUR.commitCell = el => KEY.commitCell(el);
BLUR.commitTitle = el => DBL._commitTitle(el);
BLUR.commitDrawerTitle = el => {
  const t = task(el.dataset.id);
  const v = el.value.trim();
  if (t && v && v !== t.title) updateTask(t.id, { title: v });
};
KEY.blur = el => el.blur();

/* subtasks */
A.toggleSub = el => {
  const t = task(el.dataset.id);
  const s = t.subtasks.find(x => x.id === el.dataset.sid);
  if (!s.done) fxSet({ done: s.id });
  mutate(() => {
    s.done = !s.done;
    logAct(s.done ? 'completed subtask on' : 'reopened subtask on', t, `“${s.title}”`);
  });
};
A.rmSub = el => {
  const t = task(el.dataset.id);
  mutate(() => {
    t.subtasks = t.subtasks.filter(x => x.id !== el.dataset.sid);
  });
};
KEY.addSub = el => {
  const t = task(el.dataset.id);
  const v = el.value.trim();
  if (!v) return;
  const nid = uid('s');
  fxSet({ added: nid });
  mutate(() => {
    t.subtasks.push({ id: nid, title: v, done: false });
    logAct('added subtask to', t, `“${v}”`);
  });
  setTimeout(() => $('#d-sub')?.focus(), 0);
};
A.expandRow = el => {
  S.ui.openTasks[el.dataset.id] = !S.ui.openTasks[el.dataset.id];
  render();
};

/* attachments */
A.rmAttach = el => {
  const t = task(el.dataset.id);
  const f = t.attachments.find(a => a.id === el.dataset.aid);
  mutate(() => {
    t.attachments = t.attachments.filter(a => a.id !== el.dataset.aid);
    logAct('removed a file from', t);
  });
  toast(`Removed ${f.name}`);
};
A.filePreview = el => {
  const t = task(el.dataset.tid);
  const f = t.attachments.find(a => a.id === el.dataset.aid);
  openModal({ type: 'filePreview', file: f, tid: t.id });
};
A.previewFile = el => {
  const f = D().files.find(x => x.id === el.dataset.id);
  S.ui.pop = null;
  if (f) openModal({ type: 'filePreview', file: f, tid: f.task });
};
export async function handleFiles(files, ctx) {
  if (!files || !files.length) return;
  const generation = getSessionGeneration();
  if (S.ui.offline) {
    toast("Upload failed — you're offline.", { kind: 'err', action: 'Try again', onAction: () => {} });
    return;
  }
  if (!canEditProject(proj(ctx.project), D().me, S.ui.currentUser?.role)) {
    window.dispatchEvent(new CustomEvent('smena:permission-denied', { detail: { fields: ['files'], role: 'viewer' } }));
    return;
  }
  S.ui.uploads = S.ui.uploads || [];
  for (const file of [...files]) {
    if (generation !== getSessionGeneration()) return;
    if (S.ui.filePolicy?.maxFileSizeBytes && file.size > S.ui.filePolicy.maxFileSizeBytes) {
      toast(`File is too large. Maximum size: ${fsize(S.ui.filePolicy.maxFileSizeBytes)}.`, { kind: 'err' });
      continue;
    }
    const up = {
      id: uid('u'),
      name: file.name,
      size: fsize(file.size),
      type: fileType(file.name),
      project: ctx.project,
      task: ctx.task,
      pct: 0,
      controller: new AbortController(),
    };
    S.ui.uploads.push(up);
    render();
    try {
      await retryWorkspaceSync();
      if (generation !== getSessionGeneration()) return;
      const uploadBase = structuredClone(S.data);
      const result = await uploadWorkspaceFile(
        file,
        {
          revision: S.ui.workspaceRevision,
          project: ctx.project,
          task: ctx.task,
          folderId: ctx.folderId || null,
          direct: S.ui.filePolicy?.directUploadEnabled === true,
          signal: up.controller.signal,
        },
        progress => {
          up.pct = progress;
          const bar = document.getElementById('upbar-' + up.id),
            pc = document.getElementById('upct-' + up.id);
          if (bar) bar.style.setProperty('--p', up.pct / 100);
          if (pc) pc.textContent = up.pct + '%';
        },
      );
      if (generation !== getSessionGeneration()) return;
      applyExternalCoreSnapshot(result.data, uploadBase);
      save();
      S.ui.uploads = S.ui.uploads.filter(item => item !== up);
      render();
      toast(`Uploaded ${up.name}`);
    } catch (error) {
      S.ui.uploads = S.ui.uploads.filter(item => item !== up);
      if (generation !== getSessionGeneration()) return;
      render();
      toast(error.message || `Upload failed: ${up.name}`, { kind: 'err', ms: 6000 });
    }
  }
}
A.chooseStoredFiles = el => {
  const input = document.getElementById(el.dataset.picker);
  if (input?.matches('input[type="file"][data-in="uploadFiles"]') && canEditProject(proj(input.dataset.project), D().me, S.ui.currentUser?.role)) {
    const generation = getSessionGeneration();
    // The catalog may rerender while the OS picker is open. A detached input
    // no longer bubbles change to the delegated document listener.
    input.onchange = event => {
      event.stopPropagation();
      if (generation !== getSessionGeneration()) {
        input.value = '';
        return;
      }
      IN.uploadFiles(input);
    };
    input.click();
  }
};
IN.uploadFiles = el => {
  void handleFiles(el.files, { project: el.dataset.project, task: el.dataset.task, folderId: el.dataset.folder });
  el.value = '';
};
A.cancelUpload = el => {
  S.ui.uploads?.find(item => item.id === el.dataset.id)?.controller?.abort();
};

A.downloadStoredFile = async el => {
  const file = D().files.find(item => item.id === el.dataset.id) || S.ui.modals.find(modal => modal.file?.id === el.dataset.id)?.file;
  if (!file?.storageName) return toast('This legacy file has no stored content.', { kind: 'err' });
  if (getSessionToken() === 'cookie') {
    const anchor = document.createElement('a');
    anchor.href = `/api/files/${encodeURIComponent(file.id)}/content?download=1`;
    anchor.download = file.name;
    anchor.click();
    return;
  }
  el.classList.add('is-loading');
  try {
    const { blob } = await downloadWorkspaceFile(file.id, true);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = file.name;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  } catch (error) {
    toast(error.message || 'Unable to download the file.', { kind: 'err' });
  } finally {
    el.classList.remove('is-loading');
  }
};

/* comments */
IN.draft = el => {
  const id = el.dataset.id;
  S.ui.drafts[id] = el.value;
  const before = el.value.slice(0, el.selectionStart);
  const m = before.match(/(?:^|\s)@([^@\n]*)$/u);
  const prev = JSON.stringify(S.ui.mention);
  S.ui.mention = m ? { tid: id, q: m[1] } : null;
  if (prev !== JSON.stringify(S.ui.mention)) render();
  if (el.dataset.autosize != null) autosize(el);
};
A.pickMention = el => {
  const id = el.dataset.id;
  const d = S.ui.drafts[id] || '';
  S.ui.draftMentionRefs ||= {};
  S.ui.draftMentionRefs[id] ||= [];
  S.ui.draftMentionRefs[id].push({ id: el.dataset.member, kind: el.dataset.kind, label: el.dataset.name });
  S.ui.drafts[id] = d.replace(/@([^@\n]*)$/u, '@' + el.dataset.name + ' ');
  S.ui.mention = null;
  render();
  const ta = $('#d-cmt, #inbox-reply');
  if (ta) {
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }
};
A.insertAt = el => {
  const id = el.dataset.id;
  const d = S.ui.drafts[id] || '';
  S.ui.drafts[id] = d + (d && !d.endsWith(' ') ? ' @' : '@');
  S.ui.mention = { tid: id, q: '' };
  render();
  const ta = $('#d-cmt, #inbox-reply');
  if (ta) {
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }
};
KEY.postComment = el => A.postComment(el);
A.postComment = el => {
  const id = el.dataset.id;
  const txt = (S.ui.drafts[id] || '').trim();
  if (!txt) {
    $('#d-cmt, #inbox-reply')?.focus();
    return;
  }
  const t = task(id);
  if (
    mutate(() => {
      D().comments.push({ id: uid('c'), task: id, by: D().me, at: Date.now(), text: txt, mentions: S.ui.draftMentionRefs?.[id] || [], re: {} });
      if (S.ui.draftMentionRefs) delete S.ui.draftMentionRefs[id];
      logAct('commented on', t);
      S.ui.drafts[id] = '';
      S.ui.mention = null;
      S.ui.drawerTab = 'comments';
    })
  ) {
    if (S.ui.route === 'inbox') toast('Reply posted');
  }
};
A.delComment = el => {
  const c = D().comments.find(x => x.id === el.dataset.id);
  const snap = snapshot();
  mutate(() => {
    D().comments = D().comments.filter(x => x !== c);
  });
  toast('Comment deleted', { action: 'Undo', onAction: () => restore(snap) });
};
A.react = el => {
  const c = D().comments.find(x => x.id === el.dataset.id);
  const e = el.dataset.e;
  S.ui.pop = null;
  mutate(() => {
    c.re = c.re || {};
    const l = c.re[e] || [];
    c.re[e] = l.includes(D().me) ? l.filter(x => x !== D().me) : [...l, D().me];
  });
};

/* rich text description */
document.addEventListener('mousedown', e => {
  const b = e.target.closest('[data-cmd]');
  if (!b) return;
  e.preventDefault();
  const [cmd, arg] = b.dataset.cmd.split(':');
  if (cmd === 'createLink') {
    const s = String(getSelection());
    if (/^https?:\/\//.test(s)) document.execCommand('createLink', false, s);
    else toast('Select a URL starting with https:// to turn it into a link', { kind: 'info' });
  } else document.execCommand(cmd, false, arg ? `<${arg}>` : null);
  const ed = $('#d-desc');
  if (ed) {
    const t = task(ed.dataset.rte);
    t.desc = ed.innerHTML;
    save();
  }
});
document.addEventListener('input', e => {
  const ed = e.target.closest?.('[data-rte]');
  if (!ed) return;
  const t = task(ed.dataset.rte);
  if (t) {
    t.desc = ed.innerHTML;
    t.updated = Date.now();
    save();
  }
});

/* selection & bulk */
A.selRow = el => {
  const id = el.dataset.id;
  S.ui.sel.has(id) ? S.ui.sel.delete(id) : S.ui.sel.add(id);
  render();
};
A.selAll = el => {
  const ids = $$('[data-task-row]', el.closest('.tlist')).map(r => r.dataset.taskRow);
  const all = ids.every(i => S.ui.sel.has(i));
  ids.forEach(i => (all ? S.ui.sel.delete(i) : S.ui.sel.add(i)));
  render();
};
A.clearSel = () => {
  S.ui.sel.clear();
  render();
};
A.listPage = el => {
  S.ui.listPages ||= {};
  S.ui.listPages[el.dataset.key] = Math.max(0, Number(el.dataset.page) || 0);
  render();
};
A.pdfPreviewPage = el => {
  const modal = S.ui.modals.at(-1);
  if (modal?.type === 'filePreview') void changePdfPreviewPage(modal, Number(el.dataset.page), render);
};
A.bulkSet = el => {
  const f = el.dataset.f;
  let v = el.dataset.v || null;
  const ids = [...S.ui.sel];
  S.ui.pop = null;
  if (mutate(() => ids.forEach(id => applyPatch(task(id), { [f]: v })))) toast(`Updated ${ids.length} task${ids.length > 1 ? 's' : ''}`);
};
A.bulkDelete = () => {
  const ids = [...S.ui.sel];
  confirmDlg({
    title: `Delete ${ids.length} task${ids.length > 1 ? 's' : ''}?`,
    body: 'The selected tasks, their subtasks, and comments will be permanently deleted.',
    ok: `Delete ${ids.length} task${ids.length > 1 ? 's' : ''}`,
    danger: true,
    run: () => {
      const snap = snapshot();
      if (mutate(() => deleteTasks(ids))) toast(`Deleted ${ids.length} tasks`, { action: 'Undo', onAction: () => restore(snap) });
    },
  });
};

/* views: sort, group, filters, columns */
A.sortBy = el => {
  const v = viewOf(el.dataset.key);
  const f = el.dataset.f;
  if (S.ui.justResized) return;
  v.sort = v.sort.f === f ? { f, dir: -v.sort.dir } : { f, dir: 1 };
  save();
  render();
};
A.setSort = el => {
  const v = viewOf(el.dataset.key);
  v.sort = { f: el.dataset.v, dir: v.sort.dir || 1 };
  S.ui.pop = null;
  save();
  render();
};
A.setSortDir = el => {
  viewOf(el.dataset.key).sort.dir = +el.dataset.v;
  save();
  render();
};
A.setGroup = el => {
  viewOf(el.dataset.key).group = el.dataset.v;
  S.ui.pop = null;
  save();
  render();
};
A.toggleGroup = el => {
  const gk = el.dataset.gk;
  S.ui.collapsedGroups[gk] = el.getAttribute('aria-expanded') === 'true';
  render();
};
A.setViewMode = el => {
  viewOf(el.dataset.key).mode = el.dataset.v;
  save();
  render();
};
A.toggleCol2 = el => {
  const v = viewOf(el.dataset.key);
  const c = el.dataset.v;
  v.hidden = v.hidden.includes(c) ? v.hidden.filter(x => x !== c) : [...v.hidden, c];
  save();
  render();
};
A.resetCols = el => {
  viewOf(el.dataset.key).colW = {};
  S.ui.pop = null;
  save();
  render();
};
IN.viewQ = el => {
  viewOf(el.dataset.key).q = el.value;
  render();
};
A.addFilter = el => {
  const v = viewOf(el.dataset.key);
  v.filters.push({ f: el.dataset.f, op: 'is', v: [] });
  if (S.ui.pop?.type === 'filter') S.ui.pop.edit = v.filters.length - 1;
  else {
    const r = el.getBoundingClientRect();
    S.ui.pop = { type: 'filter', key: el.dataset.key, x: r.left, y: r.bottom + 4, edit: v.filters.length - 1 };
  }
  save();
  render();
};
A.fEdit = el => {
  const p = S.ui.pop;
  p.edit = p.edit === +el.dataset.i ? null : +el.dataset.i;
  render();
};
A.fToggleVal = el => {
  const f = viewOf(el.dataset.key).filters[+el.dataset.i];
  const x = el.dataset.v;
  f.v = f.v.includes(x) ? f.v.filter(y => y !== x) : [...f.v, x];
  save();
  render();
};
A.rmFilter = el => {
  const v = viewOf(el.dataset.key);
  v.filters.splice(+el.dataset.i, 1);
  if (S.ui.pop && S.ui.pop.type === 'fvals') S.ui.pop = null;
  if (S.ui.pop?.type === 'filter') S.ui.pop.edit = null;
  save();
  render();
};
A.clearFilters = el => {
  const v = viewOf(el.dataset.key);
  v.filters = [];
  v.q = '';
  S.ui.pop = null;
  save();
  render();
};
IN.fField = el => {
  const f = viewOf(el.dataset.key).filters[+el.dataset.i];
  f.f = el.value;
  f.v = [];
  S.ui.pop.edit = +el.dataset.i;
  save();
  render();
};
IN.fOp = el => {
  viewOf(el.dataset.key).filters[+el.dataset.i].op = el.value;
  save();
  render();
};
A.saveView = el => {
  const k = 'p:' + el.dataset.id;
  openModal({ type: 'saveView', pid: el.dataset.id, nf: viewOf(k).filters.length });
};
A.saveViewSubmit = () => {
  const m = S.ui.modals[S.ui.modals.length - 1];
  const name = $('#sv-name').value.trim() || 'Untitled view';
  const type = $('#sv-type').value;
  const sv = { id: uid('v'), project: m.pid, name, type, filters: JSON.parse(JSON.stringify(viewOf('p:' + m.pid).filters)) };
  D().savedViews.push(sv);
  save();
  S.ui.modals.pop();
  go('project', { id: m.pid, tab: 'v:' + sv.id }, { tab: true });
  toast(`Saved view “${name}”`);
};
A.renameView = el => {
  const v = D().savedViews.find(x => x.id === el.dataset.id);
  S.ui.pop = null;
  openModal({
    type: 'prompt',
    title: 'Rename view',
    label: 'View name',
    value: v.name,
    run: val => {
      if (val) {
        v.name = val;
        save();
      }
    },
  });
};
A.delView = el => {
  const v = D().savedViews.find(x => x.id === el.dataset.id);
  S.ui.pop = null;
  D().savedViews = D().savedViews.filter(x => x !== v);
  save();
  if (S.ui.params.tab === 'v:' + v.id) go('project', { id: v.project, tab: 'list' }, { tab: true });
  else render();
  toast(`Deleted view “${v.name}”`);
};

/* board column menu */
A.toggleCol = el => {
  delete S.ui.collapsedCols[el.dataset.ck];
  render();
};
A.colCollapse = el => {
  S.ui.collapsedCols[S.ui.pop.key + ':' + el.dataset.id] = true;
  S.ui.pop = null;
  render();
};
A.colAdd = el => {
  const key = S.ui.pop.key;
  const pid = projectFromKey(key);
  S.ui.pop = null;
  A.startComposer({ dataset: { ctx: key, group: el.dataset.id, gb: JSON.stringify({ status: el.dataset.id, ...(pid ? { project: pid } : {}) }) } });
};
export function colTasks(key, st) {
  const pid = projectFromKey(key);
  return (pid ? tasksOf(pid) : allTasks()).filter(t => t.status === st);
}
A.colDoneAll = el => {
  const ts = colTasks(S.ui.pop.key, el.dataset.id);
  S.ui.pop = null;
  if (!ts.length) {
    render();
    return;
  }
  const snap = snapshot();
  if (mutate(() => ts.forEach(t => applyPatch(t, { status: 'done' }))))
    toast(`Marked ${ts.length} tasks as done`, { action: 'Undo', onAction: () => restore(snap) });
};
A.colArchive = () => {
  const ts = colTasks(S.ui.pop.key, 'done');
  S.ui.pop = null;
  const snap = snapshot();
  if (
    mutate(() =>
      ts.forEach(t => {
        t.archived = true;
        t.archivedAt = Date.now();
      }),
    )
  )
    toast(`Archived ${ts.length} completed tasks`, { action: 'Undo', onAction: () => restore(snap) });
};
A.colSortPrio = el => {
  const ts = colTasks(S.ui.pop.key, el.dataset.id).sort((a, b) => PR[b.priority].w - PR[a.priority].w);
  const base = Math.min(...ts.map(t => t.order));
  S.ui.pop = null;
  mutate(() => ts.forEach((t, i) => (t.order = base + i * 0.001)));
};

/* calendar & timeline */
A.calNav = el => {
  const d = +el.dataset.d;
  const cur = parse(S.ui.calDate);
  S.ui.calDate = d === 0 ? iso(TODAY) : S.ui.calMode === 'month' ? iso(new Date(cur.getFullYear(), cur.getMonth() + d, 1)) : iso(addD(cur, d * 7));
  render();
};
A.tlToday = () => {
  const r = $('#tl-right');
  if (r) r.scrollTo({ left: Math.max(0, +$('.tl').dataset.tlToday - 160), behavior: 'smooth' });
};
IN.tlGroup = el => {
  S.ui.tlGroup = el.value;
  render();
};

/* projects */
IN.projQ = el => {
  S.ui.projQ = el.value;
  render();
};
IN.projStatus = el => {
  S.ui.projStatus = el.value;
  render();
};
IN.projSort = el => {
  S.ui.projSort = el.value;
  render();
};
A.clearProjFilters = () => {
  S.ui.projQ = '';
  S.ui.projStatus = 'all';
  render();
};

function projectMilestone(projectId, milestoneId) {
  const project = proj(projectId);
  if (!project || !milestoneId) return { project: null, milestone: null, index: -1 };
  project.milestones = Array.isArray(project.milestones) ? project.milestones : [];
  const milestoneIndex = project.milestones.findIndex(item => item.id === milestoneId);
  return { project, milestone: project.milestones[milestoneIndex] || null, index: milestoneIndex };
}

function canManageMilestones(project) {
  return canEditProject(project, D().me, S.ui.currentUser?.role || 'viewer');
}

function logProjectMilestone(project, verb, name = '') {
  D().activity.unshift({
    id: uid('a'),
    by: D().me,
    verb,
    task: null,
    project: project.id,
    at: Date.now(),
    extra: name ? `“${name}”` : '',
  });
}

A.manageMilestones = el => {
  const project = proj(el.dataset.id || el.dataset.project);
  if (!project || !canSee(project)) return;
  openModal({ type: 'milestones', id: project.id });
};
A.newMilestone = el => {
  const project = proj(el.dataset.project || el.dataset.id);
  if (!canManageMilestones(project)) return;
  const projectDue = project.due && diffD(parse(project.due), TODAY) >= 0 ? project.due : dOff(14);
  S.ui.milestoneForm = { name: '', description: '', date: projectDue, completed: false };
  S.ui.errors = {};
  openModal({ type: 'milestone', project: project.id, index: null });
};
A.editMilestone = el => {
  const { project, milestone } = projectMilestone(el.dataset.project, el.dataset.mid);
  if (!canManageMilestones(project) || !milestone) return;
  S.ui.milestoneForm = {
    name: milestone.name || '',
    description: milestone.description || '',
    date: milestone.date || '',
    completed: Boolean(milestone.completed),
  };
  S.ui.errors = {};
  openModal({ type: 'milestone', project: project.id, milestoneId: milestone.id });
};
IN.milestoneForm = el => {
  S.ui.milestoneForm[el.dataset.f] = el.type === 'checkbox' ? el.checked : el.value;
  if (el.dataset.f === 'name' && S.ui.errors.milestoneName && el.value.trim()) S.ui.errors.milestoneName = null;
  if (el.dataset.f === 'date' && S.ui.errors.milestoneDate && el.value) S.ui.errors.milestoneDate = null;
};
A.submitMilestone = () => {
  const modal = S.ui.modals[S.ui.modals.length - 1];
  if (modal?.type !== 'milestone') return;
  const project = proj(modal.project);
  if (!canManageMilestones(project)) return;
  const form = S.ui.milestoneForm;
  form.name = ($('#milestone-name')?.value || '').trim();
  form.description = ($('#milestone-description')?.value || '').trim();
  form.date = $('#milestone-date')?.value || '';
  form.completed = Boolean($('#milestone-completed')?.checked);
  S.ui.errors.milestoneName = form.name ? null : 'Give the milestone a name';
  S.ui.errors.milestoneDate = form.date ? null : 'Choose a target date';
  if (S.ui.errors.milestoneName || S.ui.errors.milestoneDate) {
    render();
    $(`#${S.ui.errors.milestoneName ? 'milestone-name' : 'milestone-date'}`)?.focus();
    return;
  }
  const index = modal.milestoneId ? project.milestones?.findIndex(item => item.id === modal.milestoneId) : -1;
  const existing = index >= 0 ? project.milestones[index] : null;
  if (modal.milestoneId && !existing) return toast('This milestone was removed in another session.', { kind: 'err' });
  const milestone = {
    id: existing?.id || uid('ms'),
    name: form.name,
    description: form.description,
    date: form.date,
    completed: form.completed,
    completedAt: form.completed ? existing?.completedAt || Date.now() : null,
  };
  if (
    mutate(() => {
      project.milestones = Array.isArray(project.milestones) ? project.milestones : [];
      if (existing) project.milestones[index] = milestone;
      else project.milestones.push(milestone);
      logProjectMilestone(project, existing ? 'updated milestone in' : 'added milestone to', milestone.name);
    })
  ) {
    S.ui.modals.pop();
    render();
    toast(existing ? 'Milestone updated' : 'Milestone added');
  }
};
A.toggleMilestone = el => {
  const { project, milestone } = projectMilestone(el.dataset.project, el.dataset.mid);
  if (!canManageMilestones(project) || !milestone) return;
  const completed = !milestone.completed;
  if (
    mutate(() => {
      milestone.completed = completed;
      milestone.completedAt = completed ? Date.now() : null;
      logProjectMilestone(project, completed ? 'completed milestone in' : 'reopened milestone in', milestone.name);
    })
  )
    toast(completed ? 'Milestone completed' : 'Milestone reopened');
};
A.moveMilestone = el => {
  const { project, milestone, index } = projectMilestone(el.dataset.project, el.dataset.mid);
  const direction = Number(el.dataset.direction);
  const destination = index + direction;
  if (!canManageMilestones(project) || !milestone || ![-1, 1].includes(direction) || !project.milestones[destination]) return;
  if (
    mutate(() => {
      project.milestones.splice(index, 1);
      project.milestones.splice(destination, 0, milestone);
      logProjectMilestone(project, 'reordered milestones in');
    })
  )
    toast('Milestone order updated');
};
A.deleteMilestone = el => {
  const { project, milestone } = projectMilestone(el.dataset.project, el.dataset.mid);
  if (!canManageMilestones(project) || !milestone) return;
  confirmDlg({
    title: 'Delete milestone?',
    body: `“${esc(milestone.name)}” will be removed from this project. This cannot be undone.`,
    ok: 'Delete milestone',
    danger: true,
    icon: 'trash-2',
    run: () => {
      const latest = projectMilestone(project.id, milestone.id);
      if (!latest.milestone || !canManageMilestones(latest.project)) return;
      if (
        mutate(() => {
          latest.project.milestones.splice(latest.index, 1);
          logProjectMilestone(latest.project, 'deleted milestone from', latest.milestone.name);
        })
      )
        toast('Milestone deleted');
    },
  });
};
A.newProject = () => {
  if (S.ui.currentUser?.role === 'editor' && D().ws.permissions?.createProjects === false) {
    toast('You do not have permission to save workspace changes.', { kind: 'err' });
    return;
  }
  const availableTeams = teamsList();
  const initialTeam = primaryTeamId(availableTeams, me().team);
  S.ui.pform = { name: '', desc: '', icon: 'folder', color: 'indigo', team: initialTeam, lead: D().me, due: dOff(30), tmpl: 'blank' };
  S.ui.errors = {};
  S.ui.pop = null;
  openModal({ type: 'project' });
};
A.editProject = el => {
  const p = proj(el.dataset.id);
  S.ui.pop = null;
  S.ui.pform = { name: p.name, desc: p.desc, icon: p.icon, color: p.color, team: p.team, lead: p.lead, due: p.due, tmpl: 'blank' };
  S.ui.errors = {};
  openModal({ type: 'project', edit: p.id });
};
IN.pform = el => {
  S.ui.pform[el.dataset.f] = el.value;
  if (el.dataset.f === 'name' && S.ui.errors.pname && el.value.trim()) {
    S.ui.errors.pname = null;
    render();
  }
};
A.pformSet = el => {
  S.ui.pform[el.dataset.f] = el.dataset.v;
  if (el.dataset.f === 'tmpl') {
    const t = TEMPLATES.find(x => x.id === el.dataset.v);
    if (t && S.ui.pform.icon === 'folder') S.ui.pform.icon = t.icon === 'file' ? 'folder' : t.icon;
  }
  render();
};
export function makeKey(name) {
  let k = name
    .split(/\s+/)
    .map(w => w[0] || '')
    .join('')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 3);
  if (k.length < 2)
    k =
      name
        .replace(/[^A-Za-z]/g, '')
        .slice(0, 3)
        .toUpperCase() || 'PRJ';
  while (D().projects.some(p => p.key === k)) k += 'X';
  return k;
}
export function createProject(f, tmplId) {
  const p = {
    id: uid('p'),
    key: makeKey(f.name),
    name: f.name,
    icon: f.icon,
    color: f.color,
    status: 'planning',
    team: primaryTeamId(teamsList(), f.team),
    lead: f.lead,
    due: f.due || dOff(30),
    start: dOff(0),
    fav: false,
    members: [...new Set([D().me, f.lead])],
    desc: f.desc || 'No description yet.',
    milestones: [],
    last: 0,
  };
  D().projects.push(p);
  D().projOrder.unshift(p.id);
  D().activity.unshift({ id: uid('a'), by: D().me, verb: 'created project', task: null, project: p.id, at: Date.now(), extra: '' });
  const tm = TEMPLATES.find(t => t.id === tmplId);
  (tm?.tasks || []).forEach((title, i) =>
    createTask({
      project: p.id,
      title: templateText(title),
      status: i === 0 ? 'todo' : 'backlog',
      assignee: i === 0 ? D().me : null,
      priority: i === 0 ? 'high' : 'medium',
      due: dOff(5 + i * 5),
      start: dOff(i * 5),
    }),
  );
  return p;
}
A.submitProject = () => {
  const m = S.ui.modals[S.ui.modals.length - 1];
  const f = S.ui.pform;
  f.name = ($('#p-name')?.value || '').trim();
  f.desc = $('#p-desc')?.value || '';
  f.team = $('#p-team')?.value || '';
  f.lead = $('#p-lead')?.value || D().me;
  f.due = $('#p-due')?.value || '';
  if (!f.name) {
    S.ui.errors.pname = 'Give the project a name';
    render();
    $('#p-name')?.focus();
    return;
  }
  if (m.edit) {
    const p = proj(m.edit);
    if (
      mutate(() =>
        Object.assign(p, {
          name: f.name,
          desc: f.desc,
          icon: f.icon,
          color: f.color,
          team: f.team,
          lead: f.lead,
          due: f.due,
          members: [...new Set([...p.members, f.lead])],
        }),
      )
    ) {
      S.ui.modals.pop();
      render();
      toast('Project updated');
    }
    return;
  }
  let p;
  if (
    !mutate(() => {
      p = createProject(f, f.tmpl);
    })
  )
    return;
  S.ui.modals.pop();
  go('project', { id: p.id, tab: f.tmpl === 'blank' ? 'overview' : S.prefs.defaultTab || 'board' });
  toast(`Created ${p.name}${tasksOf(p.id).length ? ` with ${tasksOf(p.id).length} starter tasks` : ''}`);
};
A.dupProject = el => {
  const p = proj(el.dataset.id);
  S.ui.pop = null;
  let n;
  mutate(() => {
    n = createProject({ ...p, name: p.name + ' copy' }, 'blank');
    tasksOf(p.id).forEach(t => createTask({ ...JSON.parse(JSON.stringify(t)), id: uid('t'), key: undefined, project: n.id, status: 'todo' }));
  });
  toast(`Duplicated ${p.name}`, { action: 'Open', onAction: () => go('project', { id: n.id }) });
};
A.archiveProject = el => {
  const p = proj(el.dataset.id);
  S.ui.pop = null;
  confirmDlg({
    title: `Archive ${p.name}?`,
    body: 'The project will be hidden from the sidebar and project lists. Tasks, files, and comments are kept, and you can restore it from Settings → Projects.',
    ok: 'Archive project',
    icon: 'archive',
    run: () => {
      const snap = snapshot();
      if (
        mutate(() => {
          p.archived = true;
          p.archivedAt = Date.now();
        })
      ) {
        if (S.ui.route === 'project' && S.ui.params.id === p.id) go('projects');
        toast(`Archived ${p.name}`, { action: 'Undo', onAction: () => restore(snap) });
      }
    },
  });
};
A.restoreProject = el => {
  const p = proj(el.dataset.id);
  mutate(() => {
    p.archived = false;
    p.archivedAt = null;
  });
  toast(`Restored ${p.name}`);
};
A.delProject = el => {
  const p = proj(el.dataset.id);
  S.ui.pop = null;
  const n = tasksOf(p.id).length;
  confirmDlg({
    title: `Delete ${p.name}?`,
    body: `The project and its <b>${n} task${n === 1 ? '' : 's'}</b>, files, and comments will be moved to the trash.`,
    ok: 'Move to trash',
    danger: true,
    typeName: p.name,
    run: () => {
      const snap = snapshot();
      if (
        mutate(() => {
          const projectTasks = D().tasks.filter(t => t.project === p.id);
          const ids = projectTasks.map(t => t.id);
          const comments = D().comments.filter(comment => ids.includes(comment.task));
          const files = D().files.filter(file => file.project === p.id);
          moveToTrash('project', p.name, {
            project: structuredClone(p),
            tasks: structuredClone(projectTasks),
            comments: structuredClone(comments),
            files: structuredClone(files),
            orderIndex: D().projOrder.indexOf(p.id),
          });
          deleteTasks(ids, false);
          D().projects = D().projects.filter(x => x !== p);
          D().projOrder = D().projOrder.filter(x => x !== p.id);
          D().files = D().files.filter(f => f.project !== p.id);
        })
      ) {
        if (S.ui.route === 'project' && S.ui.params.id === p.id) go('projects');
        toast(`“${p.name}” moved to trash`, { action: 'Undo', onAction: () => restore(snap) });
      }
    },
  });
};
A.requestAccess = el => {
  void el;
  toast('Ask a workspace administrator to add you to this project. No automatic request was sent.', { kind: 'info', ms: 8000 });
};

/* sharing & invites */
A.share = el => {
  const id = el.dataset.id || curProjectId();
  S.ui.shareQ = '';
  S.ui.pop = null;
  openModal({ type: 'share', id });
};
IN.shareQ = el => {
  S.ui.shareQ = el.value;
  render();
};
A.shareAdd = el => {
  const p = proj(el.dataset.id);
  const m = mem(el.dataset.mid);
  mutate(() => {
    p.members.push(m.id);
  });
  S.ui.shareQ = '';
  render();
  toast(`${m.name} can now edit ${p.name}`);
};
A.shareInvite = () => {
  const m = S.ui.modals[S.ui.modals.length - 1];
  const p = proj(m.id);
  const v = ($('#share-in')?.value || '').trim();
  const perm = $('#share-perm')?.value;
  if (!v) {
    $('#share-in')?.focus();
    return;
  }
  const ex = D().members.find(x => x.email.toLowerCase() === v.toLowerCase() || x.name.toLowerCase() === v.toLowerCase());
  if (ex) {
    if (!p.members.includes(ex.id))
      mutate(() => {
        p.members.push(ex.id);
        p.perms = p.perms || {};
        p.perms[ex.id] = perm;
      });
    S.ui.shareQ = '';
    render();
    toast(`Shared with ${ex.name}`);
    return;
  }
  if (S.ui.currentUser?.role !== 'admin') {
    toast('Only workspace administrators can add sign-in access.', { kind: 'err' });
    return;
  }
  if (!/^\S+@\S+\.\S+$/.test(v)) {
    toast('Enter a valid email address, like name@company.com', { kind: 'err' });
    return;
  }
  const nm = v
    .split('@')[0]
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
  mutate(() => {
    const id = uid('m');
    D().members.push({ id, name: nm, email: v, role: 'Guest', team: p.team, title: 'Guest', c: '#6B7280', status: 'invited', last: null, tz: '—' });
    p.members.push(id);
    p.perms = p.perms || {};
    p.perms[id] = perm;
  });
  S.ui.shareQ = '';
  render();
  toast(`Access added for ${v}. Share the project link directly.`, { ms: 8000 });
};
IN.sharePerm = el => {
  const p = proj(el.dataset.id);
  const mid = el.dataset.mid;
  if (el.value === '__remove') {
    const snap = snapshot();
    mutate(() => {
      p.members = p.members.filter(x => x !== mid);
    });
    toast(`Removed ${mem(mid).name}`, { action: 'Undo', onAction: () => restore(snap) });
  } else {
    mutate(() => {
      p.perms = p.perms || {};
      p.perms[mid] = el.value;
    });
    toast(`${mem(mid).name}: ${el.value}`, { ms: 1800 });
  }
};
IN.shareAccess = el => {
  const p = proj(el.dataset.id);
  mutate(() => {
    p.access = el.value;
    p.private = el.value === 'private';
  });
};
A.invite = () => {
  if (S.ui.currentUser?.role !== 'admin') {
    window.dispatchEvent(new CustomEvent('smena:permission-denied', { detail: { fields: ['members'], role: S.ui.currentUser?.role } }));
    return;
  }
  S.ui.inviteDraft = '';
  S.ui.errors = {};
  S.ui.pop = null;
  openModal({ type: 'invite' });
};
A.submitInvite = () => {
  if (S.ui.currentUser?.role !== 'admin') return;
  const raw = $('#inv-emails').value;
  S.ui.inviteDraft = raw;
  const role = $('#inv-role').value;
  const team = $('#inv-team').value;
  const list = raw
    .split(/[\s,;]+/)
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
  const bad = list.filter(e => !/^\S+@\S+\.\S+$/.test(e));
  if (!list.length) {
    S.ui.errors.invite = 'Enter at least one email address';
    render();
    return;
  }
  if (bad.length) {
    S.ui.errors.invite = `${bad[0]} isn't a valid email address`;
    render();
    return;
  }
  loadingBtn('inv-submit', 600, () => {
    if (
      !mutate(() =>
        list.forEach(e => {
          const existing = D().members.find(m => String(m.email || '').toLowerCase() === e);
          if (existing) {
            if (existing.status === 'deactivated') {
              existing.status = 'active';
              existing.role = role;
              existing.team = team;
            }
          } else
            D().members.push({
              id: uid('m'),
              name: e
                .split('@')[0]
                .replace(/[._-]+/g, ' ')
                .replace(/\b\w/g, c => c.toUpperCase()),
              email: e,
              role,
              team,
              title: role,
              c: '#6B7280',
              status: 'active',
              last: null,
              tz: '—',
            });
        }),
      )
    )
      return;
    S.ui.modals.pop();
    S.ui.errors = {};
    render();
    toast(`Access added for ${list.length}. Send the site link to the team members.`, {
      action: 'Copy link',
      onAction: () => copy(location.origin, 'Sign-in link copied'),
      ms: 8000,
    });
  });
};
A.copyInviteLink = () => copy(location.origin, 'Sign-in link copied');
A.resendInvite = el => {
  const email = mem(el.dataset.id)?.email;
  S.ui.pop = null;
  render();
  copy(location.origin, `Link copied for ${email}. Send it to the team member manually.`);
};
A.toggleMemberAccess = el => {
  if (S.ui.currentUser?.role !== 'admin') return;
  const m = mem(el.dataset.id);
  if (!m || m.id === D().me || m.role === 'Owner') return;
  S.ui.pop = null;
  const reactivate = m.status === 'deactivated';
  if (!reactivate && isWorkspaceAdministrator(m) && activeWorkspaceAdministrators(D()).length <= 1) {
    render();
    toast('The last administrator cannot be deactivated.', { kind: 'err', ms: 7000 });
    return;
  }
  const run = () => {
    if (
      mutate(() => {
        m.status = reactivate ? 'active' : 'deactivated';
      })
    )
      toast(reactivate ? `Access restored for ${m.name}.` : `Access suspended for ${m.name}.`);
  };
  if (reactivate) run();
  else
    confirmDlg({
      title: `Deactivate ${m.name}?`,
      body: `${esc(m.name)} will not be able to sign in to the workspace until access is restored. Assigned tasks and history will be preserved.`,
      ok: 'Deactivate',
      danger: true,
      icon: 'user-x',
      run,
    });
};
A.viewProfile = el => go('member', { id: el.dataset.id });
A.assignToMember = el => {
  S.ui.pop = null;
  A.newTask({ dataset: { assignee: el.dataset.id } });
};
A.removeMember = el => {
  if (S.ui.currentUser?.role !== 'admin') {
    window.dispatchEvent(new CustomEvent('smena:permission-denied', { detail: { fields: ['members'], role: S.ui.currentUser?.role } }));
    return;
  }
  const m = mem(el.dataset.id);
  S.ui.pop = null;
  const n = allTasks().filter(t => t.assignee === m.id && t.status !== 'done').length;
  confirmDlg({
    title: `Remove ${m.name}?`,
    body: `${esc(m.name)} will lose access to ${esc(D().ws.name)} immediately.${n ? ` Their <b>${n} open task${n > 1 ? 's' : ''}</b> will become unassigned.` : ''}`,
    ok: 'Remove member',
    danger: true,
    icon: 'user-minus',
    run: () => {
      const snap = snapshot();
      if (
        mutate(() => {
          D().members = D().members.filter(x => x !== m);
          D().tasks.forEach(t => {
            if (t.assignee === m.id) t.assignee = null;
          });
          D().projects.forEach(p => (p.members = p.members.filter(x => x !== m.id)));
        })
      ) {
        if (S.ui.route === 'member') go('members');
        toast(`Removed ${m.name}`, { action: 'Undo', onAction: () => restore(snap) });
      }
    },
  });
};
IN.memQ = el => {
  S.ui.memQ = el.value;
  render();
};
IN.actWho = el => {
  S.ui.actWho = el.value;
  render();
};

/* files */
IN.fileQ = el => {
  S.ui.fileQ = el.value;
  render();
};
IN.fileType = el => {
  S.ui.fileType = el.value;
  render();
};
IN.fileSort = el => {
  S.ui.fileSort = el.value;
  saveFilePreferences();
  render();
};
IN.fileProject = el => {
  S.ui.fileProject = el.value;
  S.ui.fileFolder = null;
  S.ui.fileFolderQuery = '';
  S.ui.fileFolderOffset = 0;
  S.ui.fileFoldersArchived = false;
  if (el.value !== 'all') S.ui.fileUploadProject = el.value;
  render();
};
IN.fileUploadProject = el => {
  S.ui.fileUploadProject = el.value;
  render();
};
A.clearFileFilters = () => {
  S.ui.fileQ = '';
  S.ui.fileType = 'all';
  S.ui.fileProject = 'all';
  S.ui.fileFolder = null;
  S.ui.fileFolderQuery = '';
  S.ui.fileFolderOffset = 0;
  S.ui.fileFoldersArchived = false;
  render();
  document.getElementById('workspace-file-q')?.focus({ preventScroll: true });
};
A.clearFileQuery = () => {
  S.ui.fileQ = '';
  render();
  document.getElementById('workspace-file-q')?.focus({ preventScroll: true });
};
A.renameFile = el => {
  const f = D().files.find(x => x.id === el.dataset.id);
  S.ui.pop = null;
  if (!canEditFile(f, D(), S.ui.currentUser?.role)) return render();
  openModal({
    type: 'prompt',
    title: 'Rename file',
    label: 'File name',
    value: f.name,
    run: v => {
      if (v)
        mutate(() => {
          const current = D().files.find(item => item.id === f.id);
          if (!canEditFile(current, D(), S.ui.currentUser?.role)) return;
          current.name = v;
          if (!current.storageName) current.type = fileType(v);
        });
    },
  });
};
A.dupFile = el => {
  const f = D().files.find(x => x.id === el.dataset.id);
  S.ui.pop = null;
  if (!canEditFile(f, D(), S.ui.currentUser?.role)) return render();
  mutate(() => {
    const i = D().files.indexOf(f);
    D().files.splice(i + 1, 0, { ...f, id: uid('f'), name: f.name.replace(/(\.[^.]+)$/, ' copy$1'), at: Date.now(), by: D().me });
  });
  toast('File duplicated');
};
A.delFile = el => {
  const f = D().files.find(x => x.id === el.dataset.id);
  S.ui.pop = null;
  if (!canRemoveFile(f, D(), S.ui.currentUser?.role)) return render();
  confirmDlg({
    title: 'Delete file?',
    body: `<b>${esc(f.name)}</b> will be removed from the project${f.task ? ' and its task' : ''}.`,
    ok: 'Delete file',
    danger: true,
    run: () => {
      const currentFile = D().files.find(item => item.id === f.id);
      if (!canRemoveFile(currentFile, D(), S.ui.currentUser?.role)) return;
      const snap = snapshot();
      if (
        mutate(() => {
          const attachment = detachTaskFile(currentFile.task ? task(currentFile.task) : null, currentFile);
          moveToTrash('file', currentFile.name, { file: structuredClone(currentFile), attachment: attachment ? structuredClone(attachment) : null });
          D().files = D().files.filter(item => item.id !== currentFile.id);
        })
      )
        toast(`“${currentFile.name}” moved to trash`, { action: 'Undo', onAction: () => restore(snap) });
    },
  });
};

/* inbox & notifications */
registerNotificationActions(A);

/* search & palette */
A.openPalette = () => {
  S.ui.palOpener = focusKey(document.activeElement);
  S.ui.palette = { q: '', mode: 'cmd', scope: 'all', hl: 0 };
  S.ui.pop = null;
  render();
};
A.openSearch = () => {
  S.ui.palOpener = focusKey(document.activeElement);
  S.ui.palette = { q: '', mode: 'search', scope: 'all', hl: 0 };
  S.ui.pop = null;
  S.ui.mnav = false;
  render();
};
A.closePalette = () => {
  S.ui.palette = null;
  render();
};
A.palScope = el => {
  S.ui.palette.scope = el.dataset.v;
  S.ui.palette.hl = 0;
  render();
  $('#pal-in')?.focus();
};
IN.palQ = el => {
  S.ui.palette.q = el.value;
  S.ui.palette.hl = 0;
  render();
};
A.palRun = el => {
  const it = S.ui.palette?._flat?.[+el.dataset.i];
  if (!it) return;
  S.ui.palette = null;
  render();
  it.run();
};
IN.searchQ = el => {
  S.ui.searchQ = el.value;
  render();
};
A.setSearch = el => {
  S.ui.searchQ = el.dataset.q;
  render();
  $('#search-page-q')?.focus();
};

/* workspace, account, prototype controls */
A.switchWs = el => {
  void el;
  S.ui.pop = null;
  render();
  toast('This deployment uses one shared workspace. Rename it in workspace settings.', { kind: 'info', ms: 8000 });
};
A.newWorkspace = () => {
  if (D().ws?.name) return A.switchWs({});
  if (S.ui.currentUser?.role !== 'admin') return;
  S.ui.pop = null;
  S.ui.auth = 'onboarding';
  S.ui.onb = 1;
  S.ui.onbData.ws = '';
  S.ui.onbData.url = '';
  render();
};
A.signOut = () => {
  void revokeCurrentAuthSession().catch(() => undefined);
  clearSession();
  disableWorkspaceSync();
  S.ui.currentUser = null;
  S.ui.pop = null;
  S.ui.palette = null;
  S.ui.drawer = null;
  S.ui.modals = [];
  S.ui.auth = 'login';
  S.ui.errors = {};
  render();
};

A.loadAuthSessions = async () => {
  if (S.ui.authSessionsLoading) return;
  S.ui.authSessionsLoading = true;
  S.ui.authSessionsError = '';
  render();
  try {
    S.ui.authSessions = await getAuthSessions();
  } catch (error) {
    S.ui.authSessionsError = error.message || 'Unable to load active sessions.';
  } finally {
    S.ui.authSessionsLoading = false;
    render();
  }
};
A.revokeAuthSession = el => {
  const session = S.ui.authSessions?.find(item => item.id === el.dataset.id && !item.current);
  if (!session) return;
  confirmDlg({
    title: 'Sign out this device?',
    body: `<b>${esc(session.device)}</b> will need to sign in again to access the workspace.`,
    ok: 'Sign out',
    danger: true,
    run: async () => {
      try {
        await revokeAuthSession(session.id);
        S.ui.authSessions = S.ui.authSessions.filter(item => item.id !== session.id);
        S.ui.modals = [];
        render();
        toast('Session signed out.');
      } catch (error) {
        toast(error.message || 'Unable to sign out this session.', { kind: 'err' });
      }
    },
  });
};
A.revokeOtherAuthSessions = () => {
  const count = S.ui.authSessions?.filter(session => !session.current).length || 0;
  if (!count) return;
  confirmDlg({
    title: 'Sign out of all other sessions?',
    body: `${count} other ${count === 1 ? 'device' : 'devices'} will need to sign in again. This device will remain signed in.`,
    ok: 'Sign out other sessions',
    danger: true,
    run: async () => {
      try {
        const result = await revokeOtherAuthSessions();
        S.ui.authSessions = result.sessions || S.ui.authSessions.filter(session => session.current);
        S.ui.modals = [];
        render();
        toast('Other sessions signed out.');
      } catch (error) {
        toast(error.message || 'Unable to sign out other sessions.', { kind: 'err' });
      }
    },
  });
};
A.shortcuts = () => {
  S.ui.pop = null;
  S.ui.palette = null;
  openModal({ type: 'shortcuts' });
};
A.startOnboarding = () => {
  S.ui.pop = null;
  S.ui.auth = 'onboarding';
  S.ui.onb = 0;
  render();
};
A.toggleOffline = () => {
  S.ui.offline = !S.ui.offline;
  S.ui.pop = null;
  render();
  toast(S.ui.offline ? 'Offline mode on — edits will fail to save' : 'Back online', { kind: S.ui.offline ? 'err' : 'ok' });
};
A.retryOnline = el => {
  el?.classList?.add('is-loading');
  void retryWorkspaceSync();
};
A.reloadWorkspaceVersion = async el => {
  el?.classList?.add('is-loading');
  try {
    const result = S.ui.syncConflict ? await acceptServerConflictVersion() : await refreshWorkspaceFromServer({ force: true });
    if (S.ui.modals.at(-1)?.type === 'syncRecovery') S.ui.modals.pop();
    render();
    toast(result.status === 'updated' ? 'Latest server version loaded.' : 'You already have the latest version.', { kind: 'info' });
  } catch (error) {
    toast(error.message || 'Unable to load the server version.', { kind: 'err', ms: 8000 });
  }
};
A.reviewSyncConflict = () => {
  if (S.ui.syncRecovery?.owner === S.ui.currentUser?.id) openModal({ type: 'syncRecovery' });
};
A.downloadSyncRecovery = () => {
  const recovery = S.ui.syncRecovery;
  if (!recovery || recovery.owner !== S.ui.currentUser?.id) return;
  const url = URL.createObjectURL(
    new Blob([JSON.stringify({ format: 'smena-conflict-recovery', version: 1, savedAt: new Date().toISOString(), ...recovery }, null, 2)], {
      type: 'application/json',
    }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `smena-recovery-${recovery.scope}-${Date.now()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
A.downloadUnsyncedCopy = () => {
  if (!S.ui.currentUser || S.ui.auth) return;
  const copy = { format: 'smena-offline-draft', version: 1, owner: S.ui.currentUser.id, savedAt: new Date().toISOString(), data: S.data, preferences: S.prefs };
  const url = URL.createObjectURL(new Blob([JSON.stringify(copy, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `smena-unsynced-${Date.now()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
A.retryPersonalSettings = () => {
  void retryPersonalPreferences();
};
A.resetDemo = () => {
  S.ui.pop = null;
  confirmDlg({
    title: 'Reset demo data?',
    body: 'All projects, tasks, and settings in this browser go back to the original sample workspace.',
    ok: 'Reset data',
    danger: true,
    icon: 'rotate-ccw',
    run: () => {
      S.data = seed();
      S.views = {};
      S.prefs = { ...DEFAULT_PREFS, theme: S.prefs.theme };
      S.ui.drawer = null;
      save();
      go('home');
      toast('Demo data restored');
    },
  });
};
A.toastInfo = el => toast(el.dataset.msg, { kind: 'info' });
A.demoToast = el => {
  const v = el.dataset.v;
  if (v === 'err') toast("Your changes couldn't be saved.", { kind: 'err', action: 'Try again', onAction: () => toast('Saved') });
  else if (v === 'retry') {
    toast('Retrying…', { kind: 'info', ms: 1200 });
    setTimeout(() => toast('Loaded successfully'), 1300);
  } else toast('Moved “Create homepage wireframes” to Review', { action: 'Undo', onAction: () => toast('Undone', { kind: 'info' }) });
};
A.demoConfirm = () =>
  confirmDlg({
    title: 'Archive Marketing Website?',
    body: 'The project will be hidden from the sidebar. You can restore it any time.',
    ok: 'Archive project',
    icon: 'archive',
    run: () => toast('This was a preview — nothing was archived', { kind: 'info' }),
  });
A.demoLoad = el => {
  el.classList.add('is-loading');
  setTimeout(() => {
    el.classList.remove('is-loading');
    toast('Loaded');
  }, 1400);
};
A.reloadPage = () => {
  S.ui.loading = true;
  render();
  setTimeout(() => {
    S.ui.loading = false;
    render();
  }, 1400);
};

/* modals */
A.closeModal = () => closeModal();
A.closeModalBg = (el, e) => {
  if (e.target === el) closeModal();
};
A.confirmOk = () => {
  const m = S.ui.modals[S.ui.modals.length - 1];
  if (m.typeName && S.ui.confirmText !== m.typeName) return;
  S.ui.modals.pop();
  S.ui.confirmText = '';
  render();
  m.run && m.run();
};
IN.confirmText = el => {
  S.ui.confirmText = el.value;
  const m = S.ui.modals[S.ui.modals.length - 1];
  const b = $('.modal:last-of-type [data-a="confirmOk"]') || $$('[data-a="confirmOk"]').pop();
  if (b) b.disabled = el.value !== m.typeName;
};
A.promptSubmit = () => {
  const m = S.ui.modals[S.ui.modals.length - 1];
  const v = $('#prompt-in').value.trim();
  S.ui.modals.pop();
  render();
  m.run(v);
};
IN.noop = () => {};

/* settings */
IN.prefToggle = el => {
  S.prefs[el.dataset.k] = el.checked;
  save();
};
IN.workspacePermToggle = el => {
  if (S.ui.currentUser?.role !== 'admin' || el.dataset.k !== 'createProjects') return;
  D().ws.permissions = { ...D().ws.permissions, createProjects: el.checked };
  save();
};
IN.npToggle = async el => {
  if (el.checked && el.dataset.k.startsWith('push_')) {
    try {
      await enableWebPush();
      S.ui.pushState = 'ready';
    } catch (error) {
      el.checked = false;
      S.ui.pushState = error.code === 'PUSH_DISABLED' ? 'unavailable' : error.code === 'PUSH_BLOCKED' ? 'denied' : 'error';
      render();
      toast(error.message || 'Background notifications could not be enabled.', { kind: 'err', ms: 6000 });
      return;
    }
  }
  if (!setMyNotificationPreference(el.dataset.k, el.checked)) return;
  const saved = await persistPersonalChange({ notificationPreferences: { [el.dataset.k]: el.checked } });
  if (!saved) return;
  if (!el.checked && el.dataset.k.startsWith('push_')) {
    const preferences = myNotificationPreferences();
    if (!hasEnabledPushPreferences(preferences)) {
      await disableWebPush().catch(() => undefined);
      S.ui.pushState = 'idle';
    }
  }
  render();
  toast('Notification preferences saved', { ms: 1500 });
};
A.retryPush = async () => {
  S.ui.pushState = 'checking';
  render();
  try {
    S.ui.pushState = await syncWebPushSubscription(myNotificationPreferences());
    render();
    if (S.ui.pushState === 'ready') toast('Browser notifications are connected.', { ms: 2200 });
  } catch (error) {
    S.ui.pushState = 'error';
    render();
    toast(error.message || 'Background notifications could not be connected.', { kind: 'err', ms: 6000 });
  }
};
A.refreshNotificationDelivery = async () => {
  if (S.ui.currentUser?.role !== 'admin' || S.ui.notificationDeliveryLoading) return;
  S.ui.notificationDeliveryLoading = true;
  render();
  try {
    S.ui.notificationDeliveryStatus = await getNotificationDeliveryStatus();
    toast('Notification delivery status updated.', { ms: 1800 });
  } catch (error) {
    toast(error.message || 'Unable to load notification delivery status.', { kind: 'err', ms: 6000 });
  } finally {
    S.ui.notificationDeliveryLoading = false;
    render();
  }
};
A.retryNotificationDelivery = async () => {
  if (S.ui.currentUser?.role !== 'admin' || S.ui.notificationDeliveryLoading) return;
  S.ui.notificationDeliveryLoading = true;
  render();
  try {
    await retryNotificationDelivery();
    S.ui.notificationDeliveryStatus = await getNotificationDeliveryStatus();
    toast('Notification delivery status updated.');
  } catch (error) {
    toast(error.message, { kind: 'err' });
  } finally {
    S.ui.notificationDeliveryLoading = false;
    render();
  }
};
A.testNotificationDelivery = async el => {
  if (S.ui.currentUser?.role !== 'admin' || S.ui.testNotificationSending) return;
  S.ui.testNotificationSending = true;
  render();
  try {
    const result = await sendTestNotification(el.dataset.channel);
    S.ui.testNotificationResults = { ...S.ui.testNotificationResults, [result.channel]: result };
  } catch (error) {
    toast(error.message || 'Unable to send test notification.', { kind: 'err', ms: 8000 });
  } finally {
    S.ui.testNotificationSending = false;
    render();
  }
};
IN.prefSel = el => {
  const k = el.dataset.k;
  S.prefs[k] = k === 'weekStart' ? +el.value : el.value;
  save();
  render();
  toast('Preference updated', { ms: 1500 });
};
A.wsColor = el => {
  D().ws.c = el.dataset.v;
  save();
  render();
};
A.saveWorkspace = () => {
  const n = $('#ws-name').value.trim();
  const u = workspaceSlug($('#ws-url').value);
  if (!n) {
    toast("Workspace name can't be empty", { kind: 'err' });
    return;
  }
  if (
    mutate(() => {
      const old = D().ws.name;
      D().ws.name = n;
      D().ws.url = u || D().ws.url;
      const w = D().workspaces.find(x => x.name === old);
      if (w) w.name = n;
    })
  )
    toast('Workspace settings saved');
};
A.delWorkspace = () =>
  confirmDlg({
    title: `Delete ${D().ws.name}?`,
    body: 'Every project, task, file, and comment in this workspace will be permanently deleted for all members.',
    ok: 'Delete workspace',
    danger: true,
    typeName: D().ws.name,
    run: async () => {
      try {
        await deleteAllWorkspaces(S.ui.workspaceRevision);
        await refreshWorkspaceFromServer({ force: true });
        S.views = {};
        S.ui.auth = 'onboarding';
        S.ui.onb = 1;
        S.ui.onbData = { ...S.ui.onbData, ws: '', url: '', proj: '', invites: '', urlTouched: false, projTouched: false };
        render();
        toast('Workspace deleted. Create a new workspace to continue.', { kind: 'info', ms: 5000 });
      } catch (error) {
        toast(error.message || 'The workspace could not be deleted.', { kind: 'err', ms: 8000 });
      }
    },
  });
A.avColor = el => {
  void persistPersonalChange({ profile: { c: el.dataset.v } });
};
A.saveProfile = async () => {
  const n = $('#pf-name').value.trim();
  if (!n) {
    S.ui.errors.pname2 = 'Enter your name';
    render();
    return;
  }
  S.ui.errors.pname2 = null;
  const tt = $('#pf-title').value.trim();
  const button = $('#pf-save');
  button?.classList.add('is-loading');
  if (await persistPersonalChange({ profile: { name: n, title: tt } })) toast('Profile updated');
  button?.classList.remove('is-loading');
};
/* auth */
A.auth = el => {
  S.ui.auth = el.dataset.v;
  S.ui.errors = {};
  S.ui.pwNew = '';
  render();
  setTimeout(() => $('.auth input')?.focus(), 20);
};
A.toggleShowPw = () => {
  const fieldId = S.ui.auth === 'login' ? '#l-access' : '#l-pw';
  const v = $(fieldId)?.value;
  S.ui.showPw = !S.ui.showPw;
  render();
  const i = $(fieldId);
  if (i) {
    i.value = v;
    i.focus();
  }
};
export const EMAIL_RE = /^\S+@\S+\.\S+$/;
export function enterApp(msg) {
  if (S.ui.needsOnboarding) {
    S.ui.auth = 'onboarding';
    S.ui.onb = 1;
    S.ui.errors = {};
    render();
    toast(msg);
    return;
  }
  S.ui.auth = null;
  S.ui.errors = {};
  const target = resolveAppLocation(location.pathname, location.hash, D(), S.prefs.home || 'home');
  S.ui.locationReady = true;
  go(target.route, target.params, { fromPopstate: true });
  if (target.drawer) {
    S.ui.drawer = target.drawer;
    render();
  }
  if (target.file) {
    const file = D().files.find(item => item.id === target.file);
    if (file) openModal({ type: 'filePreview', file, tid: file.task });
  }
  toast(msg);
}
A.doLogin = async () => {
  const e = (S.ui.errors = {});
  const accessId = $('#l-access')?.value.trim() || '';
  if (!accessId) e.access = 'Enter your Access ID';
  if (Object.keys(e).length) {
    render();
    $('#l-access')?.focus();
    return;
  }
  S.ui.authBusy = true;
  S.ui.authIssue = '';
  render();
  try {
    const user = await authenticateAndLoadWorkspace(accessId);
    S.ui.authBusy = false;
    enterApp(`Signed in as ${user.name}`);
  } catch (error) {
    S.ui.authBusy = false;
    S.ui.errors = { login: error.status === 401 ? 'Invalid Access ID.' : error.message || 'Unable to sign in.' };
    render();
    $('#l-access')?.focus();
  }
};
A.doGoogleLogin = async credential => {
  if (!credential || S.ui.authBusy) return;
  S.ui.authBusy = true;
  S.ui.authIssue = '';
  S.ui.errors = {};
  render();
  try {
    const user = await authenticateWithGoogleAndLoadWorkspace(credential);
    S.ui.authBusy = false;
    enterApp(`Signed in as ${user.name}`);
  } catch (error) {
    S.ui.authBusy = false;
    const messages = {
      GOOGLE_TOKEN_INVALID: 'The Google sign-in expired. Please try again.',
      GOOGLE_EMAIL_UNVERIFIED: 'The Google account email is not verified.',
      GOOGLE_ACCESS_DENIED: 'This Google account does not have access to the workspace.',
      GOOGLE_NOT_CONFIGURED: 'Google sign-in is not configured for this workspace.',
    };
    S.ui.errors = { login: messages[error.code] || error.message || 'Unable to sign in with Google.' };
    render();
  }
};
A.socialAuth = el => {
  el.classList.add('is-loading');
  setTimeout(() => enterApp(`Signed in with ${el.dataset.v}`), 800);
};
A.doSignup = () => {
  const e = (S.ui.errors = {});
  const nm = $('#s-name').value.trim(),
    em = $('#s-email').value.trim(),
    pw = $('#s-pw').value;
  S.ui.af.name = nm;
  S.ui.af.email = em;
  if (!nm) e.name = 'Enter your name';
  if (!EMAIL_RE.test(em)) e.email = 'Enter a valid work email';
  if (pw.length < 10 || !/[0-9\W]/.test(pw)) e.pw = 'Use at least 10 characters, including a number or symbol';
  if (Object.keys(e).length) {
    render();
    $('#s-email').value = em;
    return;
  }
  loadingBtn('signup-btn', 800, () => {
    S.ui.auth = 'verify';
    startResend();
    render();
  });
};
export function startResend() {
  S.ui.resendT = 30;
  clearInterval(startResend._i);
  startResend._i = setInterval(() => {
    S.ui.resendT--;
    const el = $('#resend-t');
    if (el) el.textContent = S.ui.resendT;
    if (S.ui.resendT <= 0) {
      clearInterval(startResend._i);
      if (S.ui.auth === 'verify') render();
    }
  }, 1000);
}
A.resend = el => {
  if (el.dataset.v === 'verify') {
    startResend();
    render();
    toast(`Verification email sent to ${S.ui.af.email}`);
  } else toast(`Reset link sent to ${S.ui.af.email}`);
};
A.verified = () => {
  S.ui.auth = 'onboarding';
  S.ui.onb = 0;
  S.ui.onbData.ws = '';
  S.ui.onbData.url = '';
  render();
};
A.doForgot = () => {
  const em = $('#f-email').value.trim();
  S.ui.af.email = em;
  S.ui.errors = {};
  if (!EMAIL_RE.test(em)) {
    S.ui.errors.email = 'Enter the email you use to sign in';
    render();
    return;
  }
  loadingBtn('forgot-btn', 700, () => {
    S.ui.auth = 'forgot-sent';
    render();
  });
};
A.doReset = () => {
  const a = $('#r-pw').value,
    b = $('#r-pw2').value;
  const e = (S.ui.errors = {});
  if (a.length < 10 || !/[0-9\W]/.test(a)) e.pw = 'Use at least 10 characters, including a number or symbol';
  if (a !== b) e.pw2 = "Passwords don't match";
  if (Object.keys(e).length) {
    render();
    return;
  }
  loadingBtn('reset-btn', 700, () => {
    S.ui.auth = 'reset-done';
    S.ui.pwNew = '';
    render();
  });
};

/* onboarding */
A.onbSet = el => {
  S.ui.onbData[el.dataset.k] = el.dataset.v;
  if (el.dataset.k === 'tmpl') {
    const t = TEMPLATES.find(x => x.id === el.dataset.v);
    if (t && !S.ui.onbData.projTouched) S.ui.onbData.proj = t.name === 'Website' ? 'Website Launch' : t.name;
  }
  render();
};
IN.onbWs = el => {
  const o = S.ui.onbData;
  o.ws = el.value;
  if (!o.urlTouched) o.url = workspaceSlug(el.value);
  if (S.ui.errors.ws && el.value.trim()) S.ui.errors.ws = null;
  render();
};
IN.onbUrl = el => {
  S.ui.onbData.url = workspaceSlug(el.value);
  S.ui.onbData.urlTouched = true;
  render();
};
IN.onbProj = el => {
  S.ui.onbData.proj = el.value;
  S.ui.onbData.projTouched = true;
};
IN.onbInv = el => {
  const a = (S.ui.onbData.invites || '').split(',');
  a[+el.dataset.i] = el.value.trim();
  S.ui.onbData.invites = a.join(',');
};
A.onbBack = () => {
  S.ui.onb = Math.max(0, S.ui.onb - 1);
  render();
};
A.onbNext = el => {
  const o = S.ui.onbData;
  if (S.ui.onb === 1 && !o.ws.trim()) {
    S.ui.errors.ws = 'Name your workspace to continue';
    render();
    $('#o-ws')?.focus();
    return;
  }
  if (S.ui.onb === 3 && !o.proj.trim()) {
    toast('Give your project a name', { kind: 'err' });
    return;
  }
  if (S.ui.onb === 4 && el.dataset.skip) o.invites = '';
  if (S.ui.onb === 4 && !el.dataset.skip) {
    const bad = (o.invites || '').split(',').filter(x => x && !EMAIL_RE.test(x));
    if (bad.length) {
      toast(`${bad[0]} isn't a valid email address`, { kind: 'err' });
      return;
    }
  }
  S.ui.onb++;
  render();
  setTimeout(() => $('.auth input')?.focus(), 20);
};
A.onbExit = () => {
  S.ui.auth = null;
  render();
};
A.onbFinish = () => {
  const o = S.ui.onbData;
  let p;
  mutate(() => {
    if (o.ws.trim()) {
      const c = ['#2F2E2A', '#5A67D8', '#23918A', '#C54B78'][D().workspaces.length % 4];
      D().ws = { name: o.ws.trim(), url: o.url || 'workspace', c };
      if (!D().workspaces.some(w => w.name === D().ws.name)) D().workspaces.push({ id: uid('w'), name: D().ws.name, c, plan: 'Free' });
    }
    S.prefs.defaultTab = { kanban: 'board', list: 'list', timeline: 'timeline', table: 'table' }[o.team] || 'board';
    const tm = TEMPLATES.find(t => t.id === o.tmpl) || TEMPLATES[2];
    p = createProject(
      {
        name: (o.projTouched ? o.proj : templateText(o.proj)).trim() || templateText(tm.name),
        icon: tm.icon === 'file' ? 'folder' : tm.icon,
        color: 'indigo',
        team: me().team,
        lead: D().me,
        desc: isRussian() ? `Создан во время настройки по шаблону «${templateText(tm.name)}».` : `Created during setup from the ${tm.name} template.`,
      },
      tm.id,
    );
    (o.invites || '')
      .split(',')
      .filter(x => EMAIL_RE.test(x))
      .forEach(e =>
        D().members.push({
          id: uid('m'),
          name: e.split('@')[0].replace(/\b\w/g, c => c.toUpperCase()),
          email: e,
          role: 'Member',
          team: me().team,
          title: 'Member',
          c: '#6B7280',
          status: 'active',
          last: null,
          tz: '—',
        }),
      );
  });
  S.ui.needsOnboarding = false;
  S.ui.auth = null;
  S.ui.locationReady = true;
  go('project', { id: p.id, tab: S.prefs.defaultTab });
  toast(`Welcome to ${D().ws.name}`);
};
