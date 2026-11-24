import { A, IN, KEY, DBL, BLUR } from './registry.js';
export { A, IN, KEY, DBL, BLUR } from './registry.js';
import { registerManagementActions } from './management-loader.js';
/* =====================================================================
   ACTIONS · INPUT HANDLERS · DRAG & DROP · KEYBOARD · INIT
   ===================================================================== */
import { $, $$, TODAY, addD, dOff, diffD, esc, fmtDate, iso, parse, uid } from '../core/utils.js';
import { saveCalendarMode } from '../core/calendar-preferences.js';
import { PR, PSTAT, ST } from '../core/constants.js';

import { D, S, allTasks, canSee, logAct, me, mem, proj, save, task, tasksOf, teamsList, visibleProjects } from '../core/store.js';
import { fileType } from '../ui/helpers.js';

import { detachTaskFile } from '../shared/file-identity.js';
import { filePreferences, saveFilePreferences, fileContext } from '../core/file-preferences.js';
import { canEditFile, canRemoveFile } from '../shared/file-access.js';
import { effectiveDark } from '../core/theme.js';
import { mutate, mutateTaskCommand, toast } from '../ui/toast.js';
import { focusKey, fxSet, go, render } from '../shell/render.js';
import { saveOpenTaskHistory } from '../core/work-navigation.js';
import { viewOf } from '../shell/view-engine.js';
import { selectedEditableTasks } from '../shared/task-bulk-scope.js';
import { TEMPLATES, closeModal, openModal } from '../overlays/modals.js';
import { closePop, openPop, tgt } from '../overlays/popovers.js';
import { authenticateAndLoadWorkspace, authenticateWithGoogleAndLoadWorkspace, refreshWorkspaceFromServer } from '../core/bootstrap.js';
import { getSessionGeneration, getStorageStatus } from '../core/api.js';
import { queueWorkspaceSync, retryWorkspaceSync } from '../core/workspace-sync.js';

import { entityAllowed, resolveGraphEntity } from '../shared/relations.js';

import { graphOptions } from '../ui/relations.js';

import { workspaceSlug } from '../shared/workspace-slug.js';
import { isRussian, templateText, t, workspaceRoleName, workspaceRoleLabel } from '../core/i18n.js';
import { resolveAppLocation } from '../shared/app-location.js';
import { activeWorkspaceAdministrators, isWorkspaceAdministrator } from '../shared/workspace-membership.js';

import { primaryTeamId } from '../shared/team-relations.js';
import { captureUndo, undoCommand } from '../shared/undo.js';
import { canEditProject } from '../shared/project-access.js';
import { nextRecurrenceDate } from '../shared/calendar-time.js';
import { registerNotificationActions } from './notification-loader.js';
import { changedFavorite } from '../shared/personal-favorites.js';

import { nextTaskKey } from './task-key.js';
import { registerProjectViewActions } from './project-view-loader.js';
import { newTaskCycle, copiedTaskCycle } from '../shared/task-cycles.js';

A.reloadLanguage = () => location.reload();
A.integrationAction = el => import('../ui/integrations.js').then(module => module.integrationAction(el));
IN.integrationMemberField = el => import('../ui/integrations.js').then(module => module.captureIntegrationMemberDraft(el));
IN.publicLinkDays = el => import('../ui/public-links.js').then(module => module.capturePublicLinkDays(el));
A.publicFileLink = el => import('../ui/public-links.js').then(module => module.openPublicLink('file', el.dataset.id));
A.publicNoteLink = el => import('../ui/public-links.js').then(module => module.openPublicLink('note', el.dataset.id));
A.publicFileFolderLink = el => import('../ui/public-links.js').then(module => module.openPublicLink('file-folder', el.dataset.folder, el.dataset.project));
A.publicNoteFolderLink = el => import('../ui/public-links.js').then(module => module.openPublicLink('note-folder', el.dataset.folder));
A.publicLinkAction = el => import('../ui/public-links.js').then(module => module.publicLinkAction(el));
registerManagementActions(
  { A, IN, KEY, DBL, BLUR },
  {
    A: [
      'exportPortableWorkspace',
      'loadWorkspaceBackups',
      'createWorkspaceBackup',
      'restoreWorkspaceBackup',
      'downloadImportReport',
      'confirmPortableImport',
      'toggleSide',
      'openTask',
      'closeDrawer',
      'skipToContent',
      'projUp',
      'projDown',
      '_projMove',
      'toggleDrawerFull',
      'jumpTaskComments',
      'toggleDone',
      'toggleFavTask',
      'toggleFavProj',
      'copyLink',
      'copyText',
      'copyEmail',
      'dupTask',
      'archiveTask',
      'delTask',
      'editTask',
      'newTask',
      'formRmSub',
      'formRmFile',
      'submitTask',
      'startComposer',
      'cancelComposer',
      'commitComposer',
      'editCell',
      'toggleSub',
      'rmSub',
      'expandRow',
      'rmAttach',
      'filePreview',
      'openUploadQueue',
      'openMediaBackups',
      'toggleMediaGallery',
      'previewFile',
      'continueFilePreviewPage',
      'stepFilePreview',
      'chooseStoredFiles',
      'downloadStoredFile',
      'pickMention',
      'insertAt',
      'postComment',
      'delComment',
      'react',
      'selRow',
      'selAll',
      'clearSel',
      'listPage',
      'pdfPreviewPage',
      'bulkSet',
      'bulkCyclePick',
      'bulkDelete',
      'clearProjFilters',
      'manageMilestones',
      'newMilestone',
      'editMilestone',
      'submitMilestone',
      'toggleMilestone',
      'moveMilestone',
      'deleteMilestone',
      'requestAccess',
      'editMemberProfile',
      'share',
      'shareAdd',
      'shareInvite',
      'invite',
      'submitInvite',
      'copyInviteLink',
      'resendInvite',
      'toggleMemberAccess',
      'viewProfile',
      'assignToMember',
      'removeMember',
      'switchWs',
      'newWorkspace',
      'signOut',
      'loadAuthSessions',
      'revokeAuthSession',
      'revokeOtherAuthSessions',
      'shortcuts',
      'startOnboarding',
      'toggleOffline',
      'retryOnline',
      'reloadWorkspaceVersion',
      'reviewSyncConflict',
      'downloadSyncRecovery',
      'downloadUnsyncedCopy',
      'retryPersonalSettings',
      'resetDemo',
      'toastInfo',
      'demoToast',
      'demoConfirm',
      'demoLoad',
      'reloadPage',
      'connectPush',
      'retryPush',
      'refreshNotificationDelivery',
      'reviewNotificationDelivery',
      'retryNotificationDelivery',
      'testNotificationDelivery',
      'saveWorkspace',
      'delWorkspace',
      'avColor',
      'saveProfile',
    ],
    IN: [
      'importPortableWorkspace',
      'importConflictPolicy',
      'taskCycle',
      'form',
      'formMore',
      'formFiles',
      'composer',
      'uploadFiles',
      'draft',
      'projQ',
      'projStatus',
      'projSort',
      'milestoneForm',
      'shareQ',
      'sharePerm',
      'shareAccess',
      'memQ',
      'actWho',
      'prefToggle',
      'workspacePermToggle',
      'npToggle',
      'prefSel',
    ],
    KEY: ['formAddSub', 'commitComposer', 'commitTitle', 'commitCell', 'blur', 'addSub', 'postComment'],
    DBL: ['editTitle', '_commitTitle', 'editCell'],
    BLUR: ['commitCell', 'commitTitle', 'commitDrawerTitle'],
  },
);

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
    { project: p.id, cycleId: newTaskCycle(p, f.cycleId) },
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
  for (const k of Object.keys(patch).sort((a, b) => Number(b === 'project') - Number(a === 'project'))) {
    const old = t[k],
      nv = patch[k];
    if ((k === 'cycleId' && (old || '') === (nv || '')) || JSON.stringify(old) === JSON.stringify(nv)) continue;
    t[k] = nv;
    if (k === 'status') {
      if (nv === 'done') {
        t.completedAt = Date.now();
        t.prevStatus = old;
        logAct('completed', t);
        fxSet({ done: t.id });
      } else logAct('moved', t, `from ${ST[old].name} to ${ST[nv].name}`, { field: 'status', from: old, value: nv });
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
          cycleId: copiedTaskCycle(proj(t.project), t.cycleId),
        });
        delete n.prevStatus;
        msgs.push(`Next “${t.title}” scheduled for ${fmtDate(nd)}`);
      }
    } else if (k === 'assignee') {
      logAct('assigned', t, nv ? `to ${mem(nv)?.name}` : '(unassigned)');
    } else if (k === 'priority') logAct('changed priority of', t, `to ${PR[nv].name}`);
    else if (k === 'due') logAct('changed due date of', t, nv ? `to ${nv}` : '(cleared)', { field: k, value: nv || null });
    else if (k === 'start') logAct('changed start date of', t, nv ? `to ${nv}` : '(cleared)', { field: k, value: nv || null });
    else if (k === 'project') {
      const p = proj(nv);
      // Cycle identities belong to their project, even when names coincide.
      if (!Object.hasOwn(patch, 'cycleId')) t.cycleId = '';
      logAct('moved', t, `to ${p.name}`, { field: 'project', from: old, value: nv, fromLabel: proj(old)?.name || '', valueLabel: p.name });
    } else if (k === 'cycleId') {
      const cycle = proj(t.project)?.workflow?.cycles?.find(cycle => cycle.id === nv);
      logAct('changed cycle of', t, '', { field: k, from: old || null, value: nv || null, valueLabel: cycle?.name || '' });
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
    if (Object.hasOwn(patch, 'project') && patch.project !== S.ui.form.project && !Object.hasOwn(patch, 'cycleId'))
      patch = { ...patch, cycleId: newTaskCycle(proj(patch.project)) };
    Object.assign(S.ui.form, patch);
    render();
    return true;
  }
  const t = task(id);
  if (!t) return false;
  let msgs = [];
  const applied = mutateTaskCommand(() => {
    msgs = applyPatch(t, patch);
  });
  if (applied) msgs.forEach(m => toast(m, { kind: 'info' }));
  return applied;
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
  return mutateTaskCommand(() => {
    S.data = result.data;
  });
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
  if (h) go(h.route, h.params, { back: true, workContext: h.context });
  else go('home');
};
A.returnToMaterialSource = () => {
  const source = S.ui.materialSource;
  if (!source) return;
  if (source.route === 'search') {
    S.ui.searchQ = source.query;
    S.ui.searchCat = source.category;
  }
  go(source.route, source.params);
};
A.reload = () => render();
A.keepMaterialLocation = () => {};
A.toggleMaterialLocation = (el, event) => {
  event?.preventDefault();
  const details = el.closest('.material-location');
  if (details) details.open = !details.open;
};
A.openProject = el => go('project', { id: el.dataset.id, tab: S.prefs.defaultTab || 'board' });
A.openProjectWorkflow = async el => {
  const id = el.dataset.id,
    generation = getSessionGeneration(),
    workspace = D().ws.id || D().ws.url;
  const opener = S.ui.popOpener;
  S.ui.pop = null;
  try {
    const module = await import('../features/project-workflow.js');
    if (generation === getSessionGeneration() && workspace === (D().ws.id || D().ws.url) && canSee(proj(id))) return module.openProjectWorkflow(id, opener);
  } catch {
    if (generation === getSessionGeneration()) toast('Unable to load this action. Reload the page and try again.', { kind: 'err' });
  }
};
A.teamTaskScope = el => {
  if (S.ui.route !== 'team' || !['assigned', 'projects'].includes(el.dataset.v)) return;
  S.ui.teamTaskView = { key: (S.ui.activeWorkspace || 'default') + ':' + S.ui.params.id, scope: el.dataset.v, page: 0 };
  render();
};
A.teamTaskPage = el => {
  if (S.ui.route !== 'team') return;
  const key = (S.ui.activeWorkspace || 'default') + ':' + S.ui.params.id;
  const previous = S.ui.teamTaskView?.key === key ? S.ui.teamTaskView : {};
  S.ui.teamTaskView = { ...previous, key, page: Math.max(0, Number(el.dataset.page) || 0) };
  render();
};
A.set = el => {
  const k = el.dataset.k;
  let v = el.dataset.v;
  if (/Tab$|Cat$|Mode$|View$/.test(k)) fxSet({ tabs: true });
  if (k === 'inboxSel' && !v) v = null;
  if (k === 'inboxCat') S.ui.inboxSel = null;
  S.ui[k] = v;
  if (k === 'drawerTab') saveOpenTaskHistory();
  if (k === 'fileView') saveFilePreferences();
  if (k === 'calMode') saveCalendarMode(v);
  if (k === 'membersTab' || k === 'searchCat') S.ui.pop = null;
  render();
};

/* Material commands load with their routes or on demand from global search. */
let materialActionsPromise;
const loadMaterialActions = () =>
  (materialActionsPromise ||= import('./material-actions.js').catch(error => {
    materialActionsPromise = null;
    throw error;
  }));
export async function importKnowledgeFiles(...args) {
  const owner = getSessionGeneration(),
    module = await loadMaterialActions();
  if (owner !== getSessionGeneration()) throw Object.assign(new Error('Context changed'), { staleSession: true });
  return module.importKnowledgeFiles(...args);
}
function lazyMaterialCommands(table, names) {
  for (const name of names) {
    const run = async (...args) => {
      const owner = getSessionGeneration(),
        route = JSON.stringify([S.ui.route, S.ui.params]);
      try {
        await loadMaterialActions();
        if (owner !== getSessionGeneration() || route !== JSON.stringify([S.ui.route, S.ui.params])) return;
        if (table[name] === run) throw Error('Unable to load this tool.');
        return table[name](...args);
      } catch {
        if (owner === getSessionGeneration())
          toast(isRussian() ? 'Не удалось загрузить инструмент. Повторите попытку.' : 'Unable to load this tool. Retry.', { kind: 'err' });
      }
    };
    table[name] = run;
  }
}
lazyMaterialCommands(A, [
  'newKnowledgeNote',
  'cancelKnowledgeImport',
  'retryKnowledgeImport',
  'openKnowledgeNote',
  'previewKnowledgeNote',
  'goKnowledgeNote',
  'setKnowledgePresentation',
  'clearSearchInput',
  'closeKnowledgeDrawer',
  'followKnowledgeWiki',
  'backKnowledgeWiki',
  'editKnowledgeNote',
  'retryKnowledgeBody',
  'toggleKnowledgeFavorite',
  'setKnowledgeFolder',
  'toggleKnowledgeFolder',
  'expandKnowledgeFolders',
  'toggleKnowledgeFolderNav',
  'collapseKnowledgeFolders',
  'clearKnowledgeTag',
  'clearKnowledgeQuery',
  'loadMoreKnowledge',
  'knowledgePage',
  'newKnowledgeFolder',
  'deleteKnowledgeNote',
  'setKnowledgeTag',
  'renameKnowledgeFolder',
  'deleteKnowledgeFolder',
  'addRelationPicker',
  'resolveWikiReference',
  'createRelation',
  'removeRelation',
  'openRelatedEntity',
  'showGraph',
  'searchInGraph',
  'exportGraph',
  'newBookmark',
  'closeBookmarkForm',
  'editBookmark',
  'saveBookmark',
  'newBookmarkFolder',
  'toggleBookmarkRead',
  'toggleBookmarkArchive',
  'copyBookmark',
  'goBookmark',
  'deleteBookmark',
]);
lazyMaterialCommands(IN, [
  'importKnowledgeMarkdown',
  'knowledgeQuery',
  'knowledgeFolder',
  'knowledgeFolderQuery',
  'knowledgeSort',
  'knowledgeTag',
  'knowledgeField',
  'relationQuery',
  'relationKind',
  'relationType',
  'bookmarkQuery',
  'bookmarkFolder',
  'bookmarkDraft',
]);
lazyMaterialCommands(BLUR, ['knowledgeField']);
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
  if (el.dataset.k === 'lang') {
    try {
      localStorage.setItem('smena.language', el.dataset.v);
    } catch {
      /* storage unavailable */
    }
  }
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
  if (d.pop === 'ws') void import('../ui/workspaces.js').then(module => module.refreshWorkspaces());
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
  S.ui.popOpener = focusKey(el);
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
        k === 'assignee' ? (v ? `to ${mem(v).name}` : '(unassigned)') : v ? `to ${v}` : '(cleared)',
        k === 'due' ? { field: 'subtaskDue', value: v } : null,
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
    if (!m || m.id === D().me || m.role === 'Owner' || !['Admin', 'Member', 'Guest'].includes(v) || m.role === v) return;
    if (isWorkspaceAdministrator(m) && v !== 'Admin' && activeWorkspaceAdministrators(D()).length <= 1) {
      S.ui.pop = null;
      render();
      toast("Assign another administrator before changing the last administrator's role.", { kind: 'err', ms: 7000 });
      return;
    }
    const previous = workspaceRoleName(m.role);
    const changed = mutate(() => {
      m.role = v;
      logAct('changed the workspace role of', null, `${m.name}: ${previous} → ${workspaceRoleName(v)}`);
    });
    S.ui.pop = null;
    render();
    if (changed) toast(`${t('Role updated')} · ${m.name} · ${workspaceRoleLabel(v)}`);
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

/* inline composer */

/* subtasks */

/* attachments */

export async function handleFiles(files, ctx) {
  const picked = [...(files || [])];
  if (!picked.length) return [];
  const generation = getSessionGeneration();
  const module = await import('../core/file-upload-queue.js');
  if (generation !== getSessionGeneration()) return [];
  return module.enqueueFiles(picked, ctx);
}

/* comments */

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

function taskBulkIds() {
  let ids;
  try {
    ids = JSON.parse(document.querySelector('.bulkbar[data-task-scope]')?.dataset.taskScope || '[]');
  } catch {
    return [];
  }
  if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string')) return [];
  return selectedEditableTasks(ids, S.ui.sel, D(), S.ui.currentUser?.role || 'viewer').map(task => task.id);
}

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
  if (mutateTaskCommand(() => ts.forEach(t => applyPatch(t, { status: 'done' }))))
    toast(`Marked ${ts.length} tasks as done`, { action: 'Undo', onAction: () => restore(snap) });
};
A.colArchive = () => {
  const ts = colTasks(S.ui.pop.key, 'done');
  S.ui.pop = null;
  const snap = snapshot();
  if (
    mutateTaskCommand(() =>
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
  S.ui.calAgendaAnchor = d === 0 ? iso(TODAY) : null;
  S.ui.calDate = d === 0 ? iso(TODAY) : S.ui.calMode !== 'week' ? iso(new Date(cur.getFullYear(), cur.getMonth() + d, 1)) : iso(addD(cur, d * 7));
  render();
  if (d === 0 && S.ui.calMode === 'agenda') {
    const target = document.querySelector('[data-calendar-anchor]');
    target?.scrollIntoView({ block: 'start' });
    target?.focus({ preventScroll: true });
  }
};
A.tlToday = async () => (await import('../views/timeline.js')).focusTimelineDate();
IN.tlAnchor = async el => {
  const date = el.value;
  (await import('../views/timeline.js')).focusTimelineDate(date);
};
IN.tlGroup = el => {
  S.ui.tlGroup = el.value;
  render();
};

/* projects */

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
    iconImage: f.iconImage || null,
    color: f.color,
    status: 'planning',
    team: primaryTeamId(teamsList(), f.team),
    lead: f.lead,
    due: f.due || null,
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

/* sharing & invites */

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
A.searchAllFiles = () => {
  S.ui.fileProject = 'all';
  S.ui.fileFolder = null;
  render();
};
A.searchAllKnowledge = () => {
  S.ui.knowledgeFolder = 'all';
  S.ui.knowledgeOffset = 0;
  render();
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
registerProjectViewActions(A, IN);

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
function setPaletteScope(value, focusSelector) {
  S.ui.palette.scope = value;
  S.ui.palette.hl = 0;
  render();
  $(focusSelector)?.focus();
}
A.palScope = el => setPaletteScope(el.dataset.v, '#pal-in');
IN.palScope = el => setPaletteScope(el.value, '#pal-scope');
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
IN.searchCategory = el => {
  S.ui.searchCat = el.value;
  S.ui.pop = null;
  render();
};
IN.searchQ = el => {
  S.ui.searchQ = el.value;
  render();
};
A.searchPage = el => {
  if (!['tasks', 'projects', 'people', 'files', 'comments', 'knowledge', 'bookmarks', 'research'].includes(el.dataset.key)) return;
  S.ui.searchOffsets ||= {};
  S.ui.searchOffsets[el.dataset.key] = Math.max(0, Number(el.dataset.offset) || 0);
  render();
  const section = document.querySelector(`[data-search-category="${el.dataset.key}"]`);
  section?.scrollIntoView({ block: 'start' });
  section?.querySelector('[data-a]')?.focus({ preventScroll: true });
};
A.searchAllFileResults = () => {
  const query = S.ui.searchQ || '';
  filePreferences();
  fileContext();
  Object.assign(S.ui, { fileQ: query, fileProject: 'all', fileFolder: null, fileType: 'all', filePage: 0 });
  go('files');
};
A.setSearch = el => {
  S.ui.searchQ = el.dataset.q;
  render();
  $('#search-page-q')?.focus();
};

/* workspace, account, prototype controls */

/* modals */
A.closeModal = () => closeModal();
A.closeModalBg = (el, e) => {
  if (e.target === el) closeModal();
};
A.confirmOk = async () => {
  const m = S.ui.modals[S.ui.modals.length - 1];
  if (!m || m.busy || S.ui.atomicOperation) return;
  if (m.typeName && S.ui.confirmText !== m.typeName) return;
  if (m.awaitRun) {
    if (m.beforeRun && !m.beforeRun()) return;
    m.busy = true;
    m.error = '';
    S.ui.atomicOperation = true;
    render();
    let result;
    let succeeded = false;
    try {
      result = await m.run();
      succeeded = true;
    } catch {
      m.error = m.failureMessage || t('Something went wrong. Please try again.');
    } finally {
      m.busy = false;
      S.ui.atomicOperation = false;
      if (succeeded && S.ui.modals.at(-1) === m) {
        S.ui.modals.pop();
        S.ui.confirmText = '';
      }
      render();
    }
    if (succeeded) m.onSuccess?.(result);
    return;
  }
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
  if (target.note) {
    S.ui.knowledgeDrawer = target.note;
    S.ui.knowledgeDrawerView = 'preview';
    render();
  }
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
      const scoped = S.ui.activeWorkspace && S.ui.activeWorkspace !== 'default';
      D().ws = { ...(scoped ? { id: D().ws.id } : {}), name: o.ws.trim(), url: scoped ? D().ws.url : o.url || 'workspace', c };
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

A.clearKnowledgeCriterion = el => {
  if (el.dataset.field === 'tag') IN.knowledgeTag({ value: '' });
  else if (el.dataset.field === 'sort') IN.knowledgeSort({ value: 'updated' });
};

A.quickCapture = async () => (await import('../features/knowledge-capture.js')).openCapture();
A.customizeSidebar = async () => (await import('../features/sidebar-customization.js')).openSidebarCustomization();

A.loadKnowledgeImage = async el => (await import('../features/knowledge-media.js')).loadKnowledgeImage(el);
A.capturePdfExcerpt = async () => (await import('../features/knowledge-media.js')).capturePdfExcerpt();
A.openKnowledgeFilePage = async el => {
  await import('../features/knowledge-media.js');
  return A.openKnowledgeFilePage(el);
};
A.bindKnowledgeAsset = async el => {
  await import('../features/knowledge-media.js');
  return A.bindKnowledgeAsset(el);
};

A.keepKnowledgeOffline = async el => (await import('../features/offline-knowledge.js')).pinKnowledgeNote(el);
A.keepFileOffline = async el => (await import('../features/offline-knowledge.js')).pinKnowledgeFile(el);
A.offlineKnowledge = async () => (await import('../features/offline-knowledge.js')).reviewOfflineChanges();

A.keepBookmarkOffline = async el => (await import('../features/offline-knowledge.js')).pinBookmark(el);

A.knowledgeArchive = async () => (await import('../features/knowledge-archive.js')).openKnowledgeArchive();
A.knowledgeStorageMigration = async () => (await import('../features/knowledge-migration.js')).openKnowledgeMigration();
A.knowledgeStorageInspection = async () => {
  const generation = getSessionGeneration(),
    workspace = D().ws.id || D().ws.url;
  const module = await import('../features/knowledge-inspection.js');
  if (generation === getSessionGeneration() && workspace === (D().ws.id || D().ws.url) && S.ui.route === 'settings' && S.ui.params.sec === 'data-transfer')
    module.openKnowledgeInspection();
};

A.newWhiteboard = async el => (await import('../features/whiteboards.js')).newWhiteboard(el);

IN.permissionsRole = el => {
  S.ui.permissionsRole = el.value;
  render();
};
IN.memberRoleFilter = el => {
  if (['all', 'Owner', 'Admin', 'Member', 'Guest'].includes(el.value)) {
    S.ui.memRole = el.value;
    render();
  }
};
A.clearMemberFilters = () => {
  S.ui.memRole = 'all';
  S.ui.memQ = '';
  render();
};

A.toggleFavoriteMaterial = el => {
  const key = el.dataset.key;
  if (!entityAllowed(D(), key, graphOptions())) return;
  const entity = resolveGraphEntity(D(), key);
  if (entity) setPersonalFavorite(entity.kind, entity.item);
};
IN.favoriteKind = el => {
  S.ui.favoriteKind = el.value;
  render();
};

IN.calendarLayer = el => {
  const bit = Number(el.dataset.bit);
  if (![1, 2, 4, 8].includes(bit)) return;
  const value = S.prefs.calendarLayers ?? 3;
  S.prefs.calendarLayers = el.checked ? value | bit : value & ~bit;
  save();
  render();
};
A.openCalendarPlan = el => {
  const project = proj(el.dataset.project);
  if (!project || !canSee(project)) return;
  closePop();
  if (el.dataset.kind === 'milestone') A.manageMilestones({ dataset: { id: project.id } });
  else go('project', { id: project.id, tab: 'overview' });
};

export function setPersonalFavorite(kind, record) {
  if (!record) return;
  try {
    const change = changedFavorite(S.prefs.favorites, kind, record);
    S.prefs.favorites = change.value;
    S.ui.pop = null;
    save();
    render();
    toast(change.selected ? 'Added to favorites' : 'Removed from favorites', { ms: 1800 });
  } catch (error) {
    toast(error.message, { kind: 'err' });
  }
}

A.openMnav = el => {
  S.ui.mobileNavOpener = el?.id;
  S.ui.mnav = true;
  render();
  document.querySelector('.mobile-nav-close')?.focus();
};
IN.settingsSection = el => go('settings', { sec: el.value });
A.closeMnav = () => {
  S.ui.mnav = false;
  render();
  document.getElementById(S.ui.mobileNavOpener || 'mnav-btn')?.focus();
};
A.toggleExpand = el => {
  S.ui.expanded[el.dataset.id] = !S.ui.expanded[el.dataset.id];
  render();
};

export { refreshSystemStatus, taskBulkIds, canManageMilestones, projectMilestone, logProjectMilestone };
