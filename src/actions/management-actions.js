import { $, $$, TODAY, dOff, diffD, esc, fmtTimestamp, parse, uid } from '../core/utils.js';

import { deviceDraft, writeDeviceDraft } from '../core/device-drafts.js';
import { PR, ST } from '../core/constants.js';
import { resetSearchSession } from '../core/search-history.js';
import { seed } from '../data/seed.js';
import {
  D,
  DEFAULT_PREFS,
  S,
  allTasks,
  canSee,
  commentsOf,
  logAct,
  mem,
  myNotificationPreferences,
  proj,
  save,
  setMyNotificationPreference,
  task,
  visibleProjects,
} from '../core/store.js';
import { fileType, fsize } from '../ui/helpers.js';

import { mutate, mutateTaskCommand, toast } from '../ui/toast.js';
import { captureWorkContext, saveOpenTaskHistory, saveWorkHistory, workHistoryContext } from '../core/work-navigation.js';
import { autosize, focusKey, fxSet, go, render, syncBrowserLocation } from '../shell/render.js';
import { viewOf } from '../shell/view-engine.js';
import { selectedEditableTasks } from '../shared/task-bulk-scope.js';
import { closeModal, openModal } from '../overlays/modals.js';

import { acceptServerConflictVersion, refreshWorkspaceFromServer } from '../core/bootstrap.js';
import {
  clearSession,
  getSessionGeneration,
  getSessionToken,
  commitPortableImport,
  createWorkspaceBackup,
  downloadWorkspaceFile,
  getNotificationDeliveryStatus,
  retryNotificationDelivery,
  sendTestNotification,
  getAuthSessions,
  getWorkspaceBackups,
  revokeAuthSession,
  revokeCurrentAuthSession,
  revokeOtherAuthSessions,
  restoreWorkspaceBackup,
} from '../core/api.js';
import { disableWorkspaceSync, queueWorkspaceSync, retryWorkspaceSync, workspaceSyncIsClean } from '../core/workspace-sync.js';
import { workspaceHref } from '../shared/product.js';
import { entityAllowed } from '../shared/relations.js';
import { whiteboardMediaPosition } from '../shared/whiteboard-media.js';
import { whiteboardCopyTaskHtml } from '../shared/whiteboard-extract.js';
import { graphOptions } from '../ui/relations.js';
import { WORKSPACE_TRANSPORT_MAX_BYTES, jsonByteLength } from '../shared/workspace-size.js';

import { isRussian } from '../core/i18n.js';
import { entityRouteKey } from '../shared/app-location.js';
import { activeWorkspaceAdministrators, isWorkspaceAdministrator } from '../shared/workspace-membership.js';
import { disableWebPush, enableWebPush, syncWebPushSubscription } from '../core/push-subscriptions.js';
import { browserNotificationState } from '../core/browser-notifications.js';
import { hasEnabledPushPreferences } from '../shared/push-client.js';

import { canEditProject } from '../shared/project-access.js';

import { persistPersonalChange } from './notification-loader.js';

import { changePdfPreviewPage } from '../core/file-preview.js';
import { retryPersonalPreferences } from '../core/personal-preferences.js';

import { newTaskCycle, copiedTaskCycle, taskCycleProject, filteredTaskCycle } from '../shared/task-cycles.js';
import {
  A,
  IN,
  KEY,
  DBL,
  refreshSystemStatus,
  confirmDlg,
  updateTask,
  setPersonalFavorite,
  copy,
  createTask,
  snapshot,
  restore,
  deleteTasks,
  curProjectId,
  projectFromKey,
  applyPatch,
  handleFiles,
  taskBulkIds,
  canManageMilestones,
  projectMilestone,
  logProjectMilestone,
  loadingBtn,
} from './actions.js';
let previewSelection = 0;
export const handlers = { A: {}, IN: {}, KEY: {}, DBL: {}, BLUR: {} };
handlers.A.exportPortableWorkspace = async () => {
  if (S.ui.currentUser?.role !== 'admin') return;
  const generation = getSessionGeneration();
  let buildPortableWorkspace;
  try {
    ({ buildPortableWorkspace } = await import('../shared/portable-workspace.js'));
  } catch {
    return toast('Unable to load this action. Reload the page and try again.', { kind: 'err' });
  }
  if (generation !== getSessionGeneration() || S.ui.currentUser?.role !== 'admin') return;
  let payload;
  try {
    const { completeKnowledgeSnapshot } = await import('../core/knowledge-bodies.js');
    payload = buildPortableWorkspace(await completeKnowledgeSnapshot(D()));
  } catch {
    return toast('Unable to load this action. Reload the page and try again.', { kind: 'err' });
  }
  if (generation !== getSessionGeneration()) return;
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
handlers.A.loadWorkspaceBackups = async () => {
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
handlers.A.createWorkspaceBackup = async el => {
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
handlers.A.restoreWorkspaceBackup = el => {
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
handlers.IN.importPortableWorkspace = async el => {
  const file = el.files?.[0];
  if (!file || S.ui.currentUser?.role !== 'admin') return;
  try {
    const generation = getSessionGeneration();
    const { mergePortableWorkspace } = await import('../shared/portable-workspace.js');
    if (file.size > WORKSPACE_TRANSPORT_MAX_BYTES - 4096) throw new Error('The import file must be smaller than 4 MB.');
    const payload = JSON.parse(await file.text());
    if (jsonByteLength({ payload }) > WORKSPACE_TRANSPORT_MAX_BYTES - 4096) throw new Error('The import file must be smaller than 4 MB.');
    if (generation !== getSessionGeneration() || S.ui.currentUser?.role !== 'admin') return;
    S.ui.importPreview = { payload, policy: 'copy', result: mergePortableWorkspace(D(), payload), busy: false };
    openModal({ type: 'portableImport' });
  } catch (error) {
    toast(error.message || 'The import file could not be read.', { kind: 'err', ms: 6000 });
  } finally {
    el.value = '';
  }
};
handlers.IN.importConflictPolicy = async el => {
  const preview = S.ui.importPreview;
  if (!preview) return;
  preview.policy = el.value;
  try {
    const { mergePortableWorkspace } = await import('../shared/portable-workspace.js');
    if (S.ui.importPreview !== preview) return;
    preview.result = mergePortableWorkspace(D(), preview.payload, { conflictPolicy: preview.policy });
  } catch {
    return toast('Unable to load this action. Reload the page and try again.', { kind: 'err' });
  }
  render();
};
handlers.A.downloadImportReport = () => {
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
handlers.A.confirmPortableImport = async () => {
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
handlers.A.toggleSide = () => {
  S.ui.collapsed = !S.ui.collapsed;
  save();
  render();
};
handlers.A.openTask = el => {
  const id = el.dataset.id;
  if (!task(id)) return;
  if (!canSee(proj(task(id).project))) {
    toast("You don't have access to that task", { kind: 'err' });
    return;
  }
  const source = captureWorkContext();
  const fromWork = source && !source.drawer && S.ui.locationReady;
  const existingTaskEntry = history.state?.taskFromWork === true;
  if (fromWork) saveWorkHistory(source);
  const trigger = el.trigger || el;
  const replacing = !!S.ui.drawer && !!document.activeElement?.closest?.('.drawer');
  if (!replacing && trigger.isConnected) S.ui.drawerOpener = focusKey(trigger);
  const full = S.prefs.openTasks === 'full' || (replacing && S.ui.drawerFull);
  S.ui.drawer = id;
  S.ui.drawerFull = full;
  S.ui.pop = null;
  S.ui.palette = null;
  S.ui.modals = [];
  S.ui.mention = null;
  S.ui.subOpen = null;
  S.ui.drawerTab = S.ui.drawerTab || 'comments';
  if (fromWork || existingTaskEntry) {
    syncBrowserLocation({ push: !!fromWork, taskFromWork: true });
    saveWorkHistory(captureWorkContext());
  }
  render();
  const dr = $('.drawer');
  if (dr && !dr.contains(document.activeElement)) dr.focus({ preventScroll: true });
};
handlers.A.closeDrawer = () => {
  if (history.state?.taskFromWork && workHistoryContext(history.state)) {
    history.back();
    return;
  }
  S.ui.drawer = null;
  S.ui.drawerFull = false;
  S.ui.subOpen = null;
  render();
  if (document.activeElement === document.body) $('#main-content')?.focus({ preventScroll: true });
  S.ui.drawerOpener = null;
};
handlers.A.skipToContent = () => {
  const c = $('#main-content');
  c?.focus();
};
handlers.A.projUp = el => A._projMove(el, -1);
handlers.A.projDown = el => A._projMove(el, 1);
handlers.A._projMove = (el, d) => {
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
handlers.A.toggleDrawerFull = () => {
  S.ui.drawerFull = !S.ui.drawerFull;
  saveOpenTaskHistory();
  render();
};
handlers.A.jumpTaskComments = () => {
  S.ui.drawerTab = 'comments';
  saveOpenTaskHistory();
  render();
  requestAnimationFrame(() => {
    const discussion = document.querySelector('.task-discussion');
    discussion?.scrollIntoView({ block: 'start' });
    discussion?.focus({ preventScroll: true });
  });
};
handlers.A.toggleDone = el => {
  const t = task(el.dataset.id);
  if (!t) return;
  const wasDone = t.status === 'done';
  S.ui.pop = null;
  const applied = updateTask(t.id, { status: wasDone ? (t.prevStatus && t.prevStatus !== 'done' ? t.prevStatus : 'todo') : 'done' });
  if (applied && !wasDone && !S.ui.offline)
    toast(`Completed “${t.title}”`, { action: 'Undo', onAction: () => updateTask(t.id, { status: t.prevStatus || 'todo' }) });
};
handlers.A.toggleFavTask = el => {
  const item = allTasks().find(item => item.id === el.dataset.id);
  setPersonalFavorite('task', item);
};
handlers.A.toggleFavProj = el => {
  const p = proj(el.dataset.id);
  if (p && canSee(p)) setPersonalFavorite('project', p);
};
handlers.A.copyLink = el => {
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
handlers.A.copyText = el => copy(el.dataset.text, 'Copied to clipboard');
handlers.A.copyEmail = el => {
  S.ui.pop = null;
  render();
  copy(mem(el.dataset.id).email, 'Email copied');
};
handlers.A.dupTask = el => {
  const t = task(el.dataset.id);
  S.ui.pop = null;
  let n;
  if (
    !mutateTaskCommand(() => {
      n = createTask({
        ...JSON.parse(JSON.stringify(t)),
        id: uid('t'),
        key: undefined,
        title: t.title + ' (copy)',
        created: Date.now(),
        fav: false,
        cycleId: copiedTaskCycle(proj(t.project), t.cycleId),
      });
    })
  )
    return;
  toast('Task duplicated', { action: 'Open', onAction: () => A.openTask({ dataset: { id: n.id } }) });
};
handlers.A.archiveTask = el => {
  const t = task(el.dataset.id);
  const snap = snapshot();
  S.ui.pop = null;
  if (S.ui.drawer === t.id) S.ui.drawer = null;
  if (
    !mutateTaskCommand(() => {
      t.archived = true;
      t.archivedAt = Date.now();
      logAct('archived', t);
    })
  )
    return;
  toast(`Archived “${t.title}”`, { action: 'Undo', onAction: () => restore(snap) });
};
handlers.A.delTask = el => {
  const t = task(el.dataset.id);
  S.ui.pop = null;
  if (!t) return;
  const run = () => {
    const snap = snapshot();
    if (mutateTaskCommand(() => deleteTasks([t.id]))) toast(`“${t.title}” moved to trash`, { action: 'Undo', onAction: () => restore(snap) });
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
handlers.A.editTask = el => {
  const t = task(el.dataset.id);
  if (!t) return;
  S.ui.form = {
    title: t.title,
    desc: (t.desc || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
    project: t.project,
    cycleId: t.cycleId || '',
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
handlers.A.newTask = el => {
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
    cycleId: newTaskCycle(proj(pid), filteredTaskCycle(proj(pid), viewOf(S.ui.params.tab?.startsWith('v:') ? 's' + S.ui.params.tab : 'p:' + pid).filters)),
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
handlers.IN.taskCycle = el => updateTask(el.dataset.id, { cycleId: el.value });
handlers.IN.form = el => {
  S.ui.form[el.dataset.f] = el.value;
  if (el.dataset.f === 'title' && S.ui.errors.title && el.value.trim()) {
    S.ui.errors.title = null;
    render();
  }
};
handlers.IN.formMore = el => {
  S.ui.form.more = el.checked;
};
handlers.IN.formFiles = el => {
  [...el.files].forEach(f => S.ui.form.files.push({ name: f.name, size: fsize(f.size), type: fileType(f.name) }));
  render();
};
handlers.KEY.formAddSub = el => {
  const v = el.value.trim();
  if (!v) return;
  S.ui.form.subtasks.push({ id: uid('s'), title: v, done: false });
  render();
  setTimeout(() => $('#f-sub')?.focus(), 0);
};
handlers.A.formRmSub = el => {
  S.ui.form.subtasks.splice(+el.dataset.i, 1);
  render();
};
handlers.A.formRmFile = el => {
  S.ui.form.files.splice(+el.dataset.i, 1);
  render();
};
handlers.A.submitTask = () => {
  const m = S.ui.modals[S.ui.modals.length - 1];
  const f = S.ui.form;
  const title = ($('#f-title')?.value ?? f.title).trim();
  f.title = title;
  f.desc = $('#f-desc')?.value ?? f.desc;
  const source = !m.edit && f.whiteboardSource;
  if (source && !entityAllowed(D(), `whiteboard:${source.id}`, graphOptions(), true)) {
    toast(
      isRussian()
        ? 'Исходный холст недоступен. Скопируйте текст перед закрытием формы.'
        : 'The source canvas is unavailable. Copy your text before closing the form.',
      { kind: 'err' },
    );
    return;
  }
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
    cycleId: f.cycleId,
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
      !mutateTaskCommand(() => {
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
    !mutateTaskCommand(() => {
      t = createTask({
        ...base,
        desc: source ? whiteboardCopyTaskHtml(f.desc, source, D().ws.url) : f.desc ? `<p>${esc(f.desc)}</p>` : '',
        attachments: files,
      });
      if (source) {
        D().relations ||= [];
        D().relations.push({
          id: uid('rel'),
          from: `task:${t.id}`,
          to: `whiteboard:${source.id}`,
          type: 'source',
          createdBy: D().me,
          createdAt: new Date().toISOString(),
        });
      }
      files.forEach(x => D().files.unshift({ ...x, project: t.project, task: t.id }));
    })
  )
    return;
  if (f.more) {
    Object.assign(f, { title: '', desc: '', subtasks: [], files: [], whiteboardSource: null });
    render();
    setTimeout(() => $('#f-title')?.focus(), 0);
    toast(isRussian() ? `Задача ${t.key} создана` : `Task ${t.key} created`, { ms: 2000 });
    return;
  }
  S.ui.modals.pop();
  fxSet({ added: t.id });
  render();
  toast(isRussian() ? `Задача ${t.key} создана · ${proj(t.project).name}` : `Task ${t.key} created · ${proj(t.project).name}`, {
    action: 'Open',
    onAction: () => A.openTask({ dataset: { id: t.id } }),
  });
};
handlers.A.startComposer = el => {
  S.ui.composer = { ctx: el.dataset.ctx, group: el.dataset.group, gb: JSON.parse(el.dataset.gb || '{}'), title: '' };
  S.ui.collapsedGroups[`${el.dataset.ctx}:${el.dataset.group}`] = false;
  S.ui.pop = null;
  render();
  setTimeout(() => $('#composer-in')?.focus(), 0);
};
handlers.A.cancelComposer = () => {
  S.ui.composer = null;
  render();
};
handlers.IN.composer = el => {
  if (S.ui.composer) S.ui.composer.title = el.value;
};
handlers.KEY.commitComposer = () => A.commitComposer();
handlers.A.commitComposer = () => {
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
  f.cycleId = filteredTaskCycle(proj(f.project), viewOf(c.ctx).filters);
  if (c.ctx === 'mytasks') f.assignee = D().me;
  c.title = v;
  if (mutateTaskCommand(() => createTask(f))) {
    c.title = '';
    render();
  }
  setTimeout(() => $('#composer-in')?.focus(), 0);
};
handlers.KEY.commitTitle = el => DBL._commitTitle(el);
handlers.DBL.editTitle = el => {
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
handlers.DBL._commitTitle = el => {
  const c = S.ui.editCell;
  if (!c) return;
  S.ui.editCell = null;
  const v = el.value.trim();
  if (v && v !== task(c.id).title) updateTask(c.id, { title: v });
  else render();
};
handlers.DBL.editCell = el => {
  const item = task(el.dataset.id || el.closest('[data-id]')?.dataset.id);
  if (!item || !canEditProject(proj(item.project), D().me, S.ui.currentUser?.role)) return;
  S.ui.drawer = null;
  S.ui.editCell = { id: item.id, f: el.dataset.f };
  render();
  const i = $('#edit-cell');
  if (i) {
    i.focus();
    i.select();
  }
};
handlers.A.editCell = el => DBL.editCell(el);
handlers.KEY.commitCell = el => {
  const c = S.ui.editCell;
  if (!c) return;
  S.ui.editCell = null;
  const v = el.value.trim();
  const item = task(c.id);
  if (!item || !canEditProject(proj(item.project), D().me, S.ui.currentUser?.role)) return render();
  if (c.f === 'title' && !v) {
    render();
    return;
  }
  updateTask(c.id, { [c.f]: v || null });
};
handlers.BLUR.commitCell = el => KEY.commitCell(el);
handlers.BLUR.commitTitle = el => DBL._commitTitle(el);
handlers.BLUR.commitDrawerTitle = el => {
  const t = task(el.dataset.id);
  const v = el.value.trim();
  if (t && v && v !== t.title) updateTask(t.id, { title: v });
};
handlers.KEY.blur = el => el.blur();
handlers.A.toggleSub = el => {
  const t = task(el.dataset.id);
  const s = t.subtasks.find(x => x.id === el.dataset.sid);
  if (!s.done) fxSet({ done: s.id });
  mutate(() => {
    s.done = !s.done;
    logAct(s.done ? 'completed subtask on' : 'reopened subtask on', t, `“${s.title}”`);
  });
};
handlers.A.rmSub = el => {
  const t = task(el.dataset.id);
  mutate(() => {
    t.subtasks = t.subtasks.filter(x => x.id !== el.dataset.sid);
  });
};
handlers.KEY.addSub = el => {
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
handlers.A.expandRow = el => {
  S.ui.openTasks[el.dataset.id] = !S.ui.openTasks[el.dataset.id];
  render();
};
handlers.A.rmAttach = el => {
  const t = task(el.dataset.id);
  const f = t.attachments.find(a => a.id === el.dataset.aid);
  mutate(() => {
    t.attachments = t.attachments.filter(a => a.id !== el.dataset.aid);
    logAct('removed a file from', t);
  });
  toast(`Removed ${f.name}`);
};
handlers.A.filePreview = el => {
  const t = task(el.dataset.tid);
  const f = t.attachments.find(a => a.id === el.dataset.aid);
  openModal({ type: 'filePreview', file: f, tid: t.id });
};
handlers.A.openUploadQueue = async () => {
  const module = await import('../core/file-upload-queue.js');
  module.openUploadQueue();
};
handlers.A.openMediaBackups = async () => (await import('../features/media-backups.js')).openMediaBackups();
handlers.A.toggleMediaGallery = () => {
  const m = S.ui.modals.at(-1),
    c = m?.previewContext;
  if (m?.type !== 'filePreview' || !c) return;
  c.allIds ||= [...c.ids];
  c.mediaOnly = !c.mediaOnly;
  c.ids = c.mediaOnly
    ? c.allIds.filter(id => id === m.file.id || D().files.some(file => file.id === id && ['img', 'video', 'audio'].includes(file.type)))
    : [...c.allIds];
  render();
};
handlers.A.previewFile = async el => {
  const intent = ++previewSelection;
  const owner = getSessionGeneration(),
    route = JSON.stringify([S.ui.route, S.ui.params]);
  if (!D().files.some(x => x.id === el.dataset.id)) {
    try {
      await (await import('../features/file-catalog-demand.js')).ensureFileIdentities([el.dataset.id]);
    } catch {
      if (owner === getSessionGeneration()) toast('Unable to load files. Check connection and retry.', { kind: 'err' });
      return;
    }
  }
  if (intent !== previewSelection || owner !== getSessionGeneration() || route !== JSON.stringify([S.ui.route, S.ui.params])) return;
  const f = D().files.find(x => x.id === el.dataset.id);
  S.ui.pop = null;
  const position = f
    ? whiteboardMediaPosition(
        f,
        el.dataset.page ? { page: Number(el.dataset.page) } : el.dataset.seconds != null ? { seconds: Number(el.dataset.seconds) } : null,
      )
    : {};
  if (f && entityAllowed(D(), `file:${f.id}`, graphOptions()))
    openModal({
      type: 'filePreview',
      file: f,
      initialPage: position.page,
      initialTime: position.seconds,
      tid: f.task,
      previewContext: {
        owner: getSessionGeneration(),
        workspace: S.ui.activeWorkspace,
        pageKey: el.closest?.('.files-page')?.dataset.previewPageKey,
        page: Number(el.closest?.('.files-page')?.dataset.previewPage || 0),
        pages: Number(el.closest?.('.files-page')?.dataset.previewPages || 1),
        ids: [...new Set([...document.querySelectorAll('.files-page [data-a="previewFile"]')].map(b => b.dataset.id))].slice(0, 500),
      },
    });
  else toast('This file is unavailable or access changed.', { kind: 'err' });
};
handlers.A.continueFilePreviewPage = el => {
  const m = S.ui.modals.at(-1),
    c = m?.previewContext;
  const page = Number(el.dataset.page);
  if (
    m?.type !== 'filePreview' ||
    !c ||
    c.owner !== getSessionGeneration() ||
    c.workspace !== S.ui.activeWorkspace ||
    !Number.isInteger(page) ||
    page < 0 ||
    page >= c.pages ||
    document.querySelector('.files-page')?.dataset.previewPageKey !== c.pageKey
  )
    return;
  closeModal();
  A.listPage({ dataset: { key: c.pageKey, page } });
  const heading = document.querySelector('.files-page h1');
  if (heading) {
    heading.tabIndex = -1;
    heading.focus();
    heading.scrollIntoView({ block: 'start' });
  }
};
handlers.A.toggleHtmlInteraction = el => {
  const m = S.ui.modals.at(-1);
  if (m?.type !== 'filePreview' || m.preview?.kind !== 'html' || el.dataset.id !== m.file.id) return;
  m.interactiveHtml = !m.interactiveHtml;
  render();
};
handlers.A.stepFilePreview = el => {
  const m = S.ui.modals.at(-1),
    context = m?.previewContext;
  if (
    m?.type !== 'filePreview' ||
    !context ||
    context.owner !== getSessionGeneration() ||
    context.workspace !== S.ui.activeWorkspace ||
    ![-1, 1].includes(Number(el.dataset.direction))
  )
    return;
  const id = context.ids[context.ids.indexOf(m.file.id) + Number(el.dataset.direction)];
  const file = D().files.find(f => f.id === id);
  if (!file || !entityAllowed(D(), `file:${id}`, graphOptions(), true)) return;
  S.ui.modals[S.ui.modals.length - 1] = { type: 'filePreview', file, tid: file.task, previewContext: context };
  render();
};
handlers.A.chooseStoredFiles = async el => {
  const input = document.getElementById(el.dataset.picker);
  if (input?.matches('input[type="file"][data-in="uploadFiles"]') && canEditProject(proj(input.dataset.project), D().me, S.ui.currentUser?.role)) {
    const generation = getSessionGeneration();
    const workspace = S.ui.activeWorkspace;
    if (S.ui.filePolicy?.directUploadEnabled && typeof window.showOpenFilePicker === 'function' && !input.hasAttribute('webkitdirectory')) {
      try {
        const handles = await window.showOpenFilePicker({ multiple: true, id: 'smena-uploads' });
        const pairs = await Promise.all(handles.map(async handle => [await handle.getFile(), handle]));
        if (generation !== getSessionGeneration() || workspace !== S.ui.activeWorkspace) return;
        await handleFiles(
          pairs.map(([file]) => file),
          { project: input.dataset.project, task: input.dataset.task, folderId: input.dataset.folder, sourceHandles: new Map(pairs) },
        );
        return;
      } catch (error) {
        if (error.name === 'AbortError') return;
        // Feature restrictions or a dismissed permission keep the standard file
        // input available; no file bytes are cached to emulate filesystem access.
        if (generation !== getSessionGeneration() || workspace !== S.ui.activeWorkspace) return;
      }
    }
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
handlers.IN.uploadFiles = el => {
  void handleFiles(el.files, { project: el.dataset.project, task: el.dataset.task, folderId: el.dataset.folder });
  el.value = '';
};
handlers.A.downloadStoredFile = async el => {
  const file = D().files.find(item => item.id === el.dataset.id) || S.ui.modals.find(modal => modal.file?.id === el.dataset.id)?.file;
  if (!file?.storageName) return toast('This legacy file has no stored content.', { kind: 'err' });
  if (getSessionToken() === 'cookie') {
    const anchor = document.createElement('a');
    anchor.href = `/api/files/${encodeURIComponent(file.id)}/content?download=1&account=${encodeURIComponent(S.ui.currentUser.id)}&workspace=${encodeURIComponent(S.ui.activeWorkspace || 'default')}`;
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
handlers.IN.draft = el => {
  const id = el.dataset.id;
  const refs = deviceDraft('comment', id)?.mentions || [];
  writeDeviceDraft('comment', id, el.value ? { text: el.value, mentions: refs.filter(ref => el.value.includes('@' + ref.label)) } : null);
  const before = el.value.slice(0, el.selectionStart);
  const m = before.match(/(?:^|\s)@([^@\n]*)$/u);
  const prev = JSON.stringify(S.ui.mention);
  S.ui.mention = m ? { tid: id, q: m[1] } : null;
  if (prev !== JSON.stringify(S.ui.mention)) render();
  if (el.dataset.autosize != null) autosize(el);
};
handlers.A.pickMention = el => {
  const id = el.dataset.id;
  const d = deviceDraft('comment', id)?.text || '';
  const mentions = [...(deviceDraft('comment', id)?.mentions || []), { id: el.dataset.member, kind: el.dataset.kind, label: el.dataset.name }];
  writeDeviceDraft('comment', id, { text: d.replace(/@([^@\n]*)$/u, '@' + el.dataset.name + ' '), mentions });
  S.ui.mention = null;
  render();
  const ta = $('#d-cmt, #inbox-reply');
  if (ta) {
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }
};
handlers.A.insertAt = el => {
  const id = el.dataset.id;
  const d = deviceDraft('comment', id)?.text || '';
  writeDeviceDraft('comment', id, { text: d + (d && !d.endsWith(' ') ? ' @' : '@'), mentions: deviceDraft('comment', id)?.mentions || [] });
  S.ui.mention = { tid: id, q: '' };
  render();
  const ta = $('#d-cmt, #inbox-reply');
  if (ta) {
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }
};
handlers.KEY.postComment = el => A.postComment(el);
handlers.A.postComment = async el => {
  const id = el.dataset.id;
  const draft = deviceDraft('comment', id);
  const txt = (draft?.text || '').trim();
  if (!txt) {
    $('#d-cmt, #inbox-reply')?.focus();
    return;
  }
  const generation = getSessionGeneration();
  const t = task(id);
  const commentId = draft.pendingId || uid('c');
  if (
    mutate(() => {
      if (!D().comments.some(c => c.id === commentId)) {
        D().comments.push({ id: commentId, task: id, by: D().me, at: Date.now(), text: txt, mentions: draft.mentions || [], re: {} });
        logAct('commented on', t);
      }
      writeDeviceDraft('comment', id, { ...draft, pendingId: commentId });
      S.ui.mention = null;
      S.ui.drawerTab = 'comments';
    })
  ) {
    try {
      await queueWorkspaceSync(S.data);
      await retryWorkspaceSync();
      if (generation !== getSessionGeneration()) return;
      if (!workspaceSyncIsClean(S.data) || !D().comments.some(c => c.id === commentId)) throw new Error('pending');
      if (deviceDraft('comment', id)?.pendingId === commentId) writeDeviceDraft('comment', id, null);
      if (S.ui.route === 'inbox') toast('Reply posted');
      render();
    } catch {
      if (generation === getSessionGeneration())
        toast(isRussian() ? 'Отправка не подтверждена. Черновик сохранён.' : 'Sending was not confirmed. Your draft is saved.', { kind: 'err' });
    }
  }
};
handlers.A.delComment = el => {
  const c = D().comments.find(x => x.id === el.dataset.id);
  const snap = snapshot();
  mutate(() => {
    D().comments = D().comments.filter(x => x !== c);
  });
  toast('Comment deleted', { action: 'Undo', onAction: () => restore(snap) });
};
handlers.A.react = el => {
  const c = D().comments.find(x => x.id === el.dataset.id);
  const e = el.dataset.e;
  S.ui.pop = null;
  mutate(() => {
    c.re = c.re || {};
    const l = c.re[e] || [];
    c.re[e] = l.includes(D().me) ? l.filter(x => x !== D().me) : [...l, D().me];
  });
};
handlers.A.selRow = el => {
  const id = el.dataset.id;
  const item = task(id);
  if (!item || !canEditProject(proj(item.project), D().me, S.ui.currentUser?.role || 'viewer')) return;
  S.ui.sel.has(id) ? S.ui.sel.delete(id) : S.ui.sel.add(id);
  render();
};
handlers.A.selAll = el => {
  const shown = $$('[data-task-row]', el.closest('.tlist')).map(r => r.dataset.taskRow);
  const ids = selectedEditableTasks(shown, new Set(shown), D(), S.ui.currentUser?.role || 'viewer').map(task => task.id);
  const all = ids.every(i => S.ui.sel.has(i));
  ids.forEach(i => (all ? S.ui.sel.delete(i) : S.ui.sel.add(i)));
  render();
};
handlers.A.clearSel = () => {
  S.ui.sel.clear();
  render();
};
handlers.A.listPage = el => {
  S.ui.listPages ||= {};
  S.ui.listPages[el.dataset.key] = Math.max(0, Number(el.dataset.page) || 0);
  render();
  if (['bookmarks', 'timeline'].includes(el.dataset.key)) {
    document.querySelector('.tl-agenda')?.scrollTo(0, 0);
    document.querySelector('.content')?.scrollTo(0, 0);
  }
};
handlers.A.pdfPreviewPage = el => {
  const modal = S.ui.modals.at(-1);
  if (modal?.preview?.kind !== 'pdf') return;
  const page = Number(el.dataset.page ?? el.elements?.namedItem('page')?.value);
  if (Number.isInteger(page) && page >= 1 && page <= modal.preview.pages && page !== modal.preview.page) void changePdfPreviewPage(modal, page, render);
};
handlers.A.toggleFileReadingMode = () => {
  const modal = S.ui.modals.at(-1);
  const toggle = document.getElementById('file-reading-mode');
  const region = toggle?.closest('.modal')?.querySelector('.file-preview-content');
  if (!region || !['pdf', 'image', 'text'].includes(modal?.preview?.kind)) return;
  if (modal.preview.kind === 'text') {
    modal.unwrapped = !modal.unwrapped;
    region.dataset.unwrapped = String(modal.unwrapped);
    toggle.setAttribute('aria-pressed', String(!modal.unwrapped));
  } else {
    modal.actualSize = !modal.actualSize;
    region.dataset.actualSize = String(modal.actualSize);
    toggle.setAttribute('aria-pressed', String(modal.actualSize));
  }
};
handlers.A.bulkSet = el => {
  const f = el.dataset.f;
  const v = f === 'cycleId' ? el.dataset.v || '' : el.dataset.v || null;
  if (
    !['status', 'assignee', 'priority', 'cycleId'].includes(f) ||
    (f === 'status' && !ST[v]) ||
    (f === 'priority' && !PR[v]) ||
    (f === 'assignee' && v && !D().members.some(m => m.id === v && m.status === 'active'))
  )
    return;
  const ids = taskBulkIds();
  if (!ids.length) return;
  const selected = new Set(ids),
    items = D().tasks.filter(task => selected.has(task.id));
  if (f === 'cycleId') {
    const project = taskCycleProject(items, D().projects);
    if (!project) return toast('Select tasks from one project to set a cycle.', { kind: 'err' });
    if (v && !project.workflow?.cycles?.some(cycle => cycle.id === v && !cycle.archived)) return toast('Choose an available cycle.', { kind: 'err' });
  }
  S.ui.pop = null;
  if (mutateTaskCommand(() => items.forEach(task => applyPatch(task, { [f]: v })))) toast(`Updated ${ids.length} task${ids.length > 1 ? 's' : ''}`);
};
handlers.A.bulkCyclePick = el => A.bulkSet({ dataset: { f: 'cycleId', v: el.dataset.v } });
handlers.A.bulkDelete = () => {
  const ids = taskBulkIds();
  if (!ids.length) return;
  confirmDlg({
    title: `Delete ${ids.length} task${ids.length > 1 ? 's' : ''}?`,
    body: isRussian()
      ? 'Выбранные задачи будут перемещены в корзину. Их можно восстановить в настройках.'
      : 'The selected tasks will move to Trash. You can restore them in Settings.',
    ok: `Delete ${ids.length} task${ids.length > 1 ? 's' : ''}`,
    danger: true,
    run: () => {
      const permitted = new Set(taskBulkIds());
      const current = ids.filter(id => permitted.has(id));
      if (!current.length) return;
      const snap = snapshot();
      if (mutate(() => deleteTasks(current))) toast(`Deleted ${current.length} tasks`, { action: 'Undo', onAction: () => restore(snap) });
    },
  });
};
handlers.IN.projQ = el => {
  S.ui.projQ = el.value;
  render();
};
handlers.IN.projStatus = el => {
  S.ui.projStatus = el.value;
  render();
};
handlers.IN.projSort = el => {
  S.ui.projSort = el.value;
  render();
};
handlers.A.clearProjFilters = () => {
  S.ui.projQ = '';
  S.ui.projStatus = 'all';
  render();
};
handlers.A.manageMilestones = el => {
  const project = proj(el.dataset.id || el.dataset.project);
  if (!project || !canSee(project)) return;
  openModal({ type: 'milestones', id: project.id });
};
handlers.A.newMilestone = el => {
  const project = proj(el.dataset.project || el.dataset.id);
  if (!canManageMilestones(project)) return;
  const projectDue = project.due && diffD(parse(project.due), TODAY) >= 0 ? project.due : dOff(14);
  S.ui.milestoneForm = { name: '', description: '', date: projectDue, completed: false };
  S.ui.errors = {};
  openModal({ type: 'milestone', project: project.id, index: null });
};
handlers.A.editMilestone = el => {
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
handlers.IN.milestoneForm = el => {
  S.ui.milestoneForm[el.dataset.f] = el.type === 'checkbox' ? el.checked : el.value;
  if (el.dataset.f === 'name' && S.ui.errors.milestoneName && el.value.trim()) S.ui.errors.milestoneName = null;
  if (el.dataset.f === 'date' && S.ui.errors.milestoneDate && el.value) S.ui.errors.milestoneDate = null;
};
handlers.A.submitMilestone = () => {
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
handlers.A.toggleMilestone = el => {
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
handlers.A.moveMilestone = el => {
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
handlers.A.deleteMilestone = el => {
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
handlers.A.requestAccess = el => {
  void el;
  toast('Ask a workspace administrator to add you to this project. No automatic request was sent.', { kind: 'info', ms: 8000 });
};
handlers.A.editMemberProfile = el => {
  if (S.ui.currentUser?.role === 'admin') void import('../ui/member-profile.js').then(module => module.editMemberProfile(el));
};
handlers.A.share = el => {
  const id = el.dataset.id || curProjectId();
  S.ui.shareQ = '';
  S.ui.pop = null;
  openModal({ type: 'share', id });
};
handlers.IN.shareQ = el => {
  S.ui.shareQ = el.value;
  render();
};
handlers.A.shareAdd = el => {
  const p = proj(el.dataset.id);
  const m = mem(el.dataset.mid);
  mutate(() => {
    p.members.push(m.id);
  });
  S.ui.shareQ = '';
  render();
  toast(`${m.name} can now edit ${p.name}`);
};
handlers.A.shareInvite = () => {
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
handlers.IN.sharePerm = el => {
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
handlers.IN.shareAccess = el => {
  const p = proj(el.dataset.id);
  mutate(() => {
    p.access = el.value;
    p.private = el.value === 'private';
  });
};
handlers.A.invite = () => {
  if (S.ui.currentUser?.role !== 'admin') {
    window.dispatchEvent(new CustomEvent('smena:permission-denied', { detail: { fields: ['members'], role: S.ui.currentUser?.role } }));
    return;
  }
  S.ui.inviteDraft = '';
  S.ui.inviteName = '';
  S.ui.inviteTitle = '';
  S.ui.errors = {};
  S.ui.pop = null;
  openModal({ type: 'invite' });
};
handlers.A.submitInvite = () => {
  if (S.ui.currentUser?.role !== 'admin') return;
  const raw = $('#inv-emails').value;
  S.ui.inviteDraft = raw;
  const name = ($('#inv-name')?.value || '').trim();
  const title = ($('#inv-title')?.value || '').trim();
  S.ui.inviteName = name;
  S.ui.inviteTitle = title;
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
  if ((name || title) && new Set(list).size !== 1) {
    S.ui.errors.invite = 'Name and job title can only be set for one person at a time.';
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
              name:
                name ||
                e
                  .split('@')[0]
                  .replace(/[._-]+/g, ' ')
                  .replace(/\b\w/g, c => c.toUpperCase()),
              email: e,
              role,
              team,
              title: title || role,
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
handlers.A.copyInviteLink = () => copy(location.origin, 'Sign-in link copied');
handlers.A.resendInvite = el => {
  const email = mem(el.dataset.id)?.email;
  S.ui.pop = null;
  render();
  copy(location.origin, `Link copied for ${email}. Send it to the team member manually.`);
};
handlers.A.toggleMemberAccess = el => {
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
handlers.A.viewProfile = el => go('member', { id: el.dataset.id });
handlers.A.assignToMember = el => {
  S.ui.pop = null;
  A.newTask({ dataset: { assignee: el.dataset.id } });
};
handlers.A.removeMember = el => {
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
handlers.IN.memQ = el => {
  S.ui.memQ = el.value;
  render();
};
handlers.IN.actWho = el => {
  S.ui.actWho = el.value;
  render();
};
handlers.A.switchWs = async el => (await import('../ui/workspaces.js')).switchWorkspace(el);
handlers.A.newWorkspace = async () => (await import('../ui/workspaces.js')).openWorkspaceCreation();
handlers.A.signOut = () => {
  void import('../core/offline-library.js').then(m => m.forgetOfflineOwner());
  resetSearchSession();
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
handlers.A.loadAuthSessions = async () => {
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
handlers.A.revokeAuthSession = el => {
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
handlers.A.revokeOtherAuthSessions = () => {
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
handlers.A.shortcuts = () => {
  S.ui.pop = null;
  S.ui.palette = null;
  openModal({ type: 'shortcuts' });
};
handlers.A.startOnboarding = () => {
  S.ui.pop = null;
  S.ui.auth = 'onboarding';
  S.ui.onb = 0;
  render();
};
handlers.A.toggleOffline = () => {
  S.ui.offline = !S.ui.offline;
  S.ui.pop = null;
  render();
  toast(S.ui.offline ? 'Offline mode on — edits will fail to save' : 'Back online', { kind: S.ui.offline ? 'err' : 'ok' });
};
handlers.A.retryOnline = el => {
  el?.classList?.add('is-loading');
  void retryWorkspaceSync();
};
handlers.A.reloadWorkspaceVersion = async el => {
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
handlers.A.reviewSyncConflict = () => {
  if (S.ui.syncRecovery?.owner === S.ui.currentUser?.id) openModal({ type: 'syncRecovery' });
};
handlers.A.downloadSyncRecovery = () => {
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
handlers.A.downloadUnsyncedCopy = () => {
  if (!S.ui.currentUser || S.ui.auth) return;
  const copy = { format: 'smena-offline-draft', version: 1, owner: S.ui.currentUser.id, savedAt: new Date().toISOString(), data: S.data, preferences: S.prefs };
  const url = URL.createObjectURL(new Blob([JSON.stringify(copy, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `smena-unsynced-${Date.now()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
handlers.A.retryPersonalSettings = () => {
  void retryPersonalPreferences();
};
handlers.A.resetDemo = () => {
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
handlers.A.toastInfo = el => toast(el.dataset.msg, { kind: 'info' });
handlers.A.demoToast = el => {
  const v = el.dataset.v;
  if (v === 'err') toast("Your changes couldn't be saved.", { kind: 'err', action: 'Try again', onAction: () => toast('Saved') });
  else if (v === 'retry') {
    toast('Retrying…', { kind: 'info', ms: 1200 });
    setTimeout(() => toast('Loaded successfully'), 1300);
  } else toast('Moved “Create homepage wireframes” to Review', { action: 'Undo', onAction: () => toast('Undone', { kind: 'info' }) });
};
handlers.A.demoConfirm = () =>
  confirmDlg({
    title: 'Archive Marketing Website?',
    body: 'The project will be hidden from the sidebar. You can restore it any time.',
    ok: 'Archive project',
    icon: 'archive',
    run: () => toast('This was a preview — nothing was archived', { kind: 'info' }),
  });
handlers.A.demoLoad = el => {
  el.classList.add('is-loading');
  setTimeout(() => {
    el.classList.remove('is-loading');
    toast('Loaded');
  }, 1400);
};
handlers.A.reloadPage = () => {
  S.ui.loading = true;
  render();
  setTimeout(() => {
    S.ui.loading = false;
    render();
  }, 1400);
};
handlers.IN.prefToggle = el => {
  S.prefs[el.dataset.k] = el.checked;
  save();
};
handlers.IN.workspacePermToggle = el => {
  if (S.ui.currentUser?.role !== 'admin' || el.dataset.k !== 'createProjects') return;
  D().ws.permissions = { ...D().ws.permissions, createProjects: el.checked };
  save();
};
handlers.IN.npToggle = async el => {
  if (el.checked && el.dataset.k.startsWith('push_') && browserNotificationState() === 'granted') {
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
handlers.A.connectPush = async () => {
  if (S.ui.pushState === 'checking' || !hasEnabledPushPreferences(myNotificationPreferences())) return;
  S.ui.pushState = 'checking';
  render();
  try {
    await enableWebPush();
    S.ui.pushState = 'ready';
    toast('Browser notifications are connected.', { ms: 2200 });
  } catch (error) {
    S.ui.pushState =
      error.code === 'PUSH_DISABLED' ? 'unavailable' : error.code === 'PUSH_BLOCKED' ? 'denied' : error.code === 'PUSH_UNSUPPORTED' ? 'unsupported' : 'error';
    toast(error.message || 'Background notifications could not be connected.', { kind: 'err', ms: 6000 });
  }
  render();
};
handlers.A.retryPush = async () => {
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
handlers.A.refreshNotificationDelivery = async () => {
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
handlers.A.reviewNotificationDelivery = async el => (await import('../ui/notification-delivery-panel.js')).reviewQueue(el);
handlers.A.retryNotificationDelivery = async () => {
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
handlers.A.testNotificationDelivery = async el => {
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
handlers.IN.prefSel = el => {
  const k = el.dataset.k;
  S.prefs[k] = k === 'weekStart' ? +el.value : el.value;
  save();
  render();
  toast('Preference updated', { ms: 1500 });
};
handlers.A.saveWorkspace = async () => (await import('../ui/workspaces.js')).saveWorkspaceSettings();
handlers.A.delWorkspace = async () => (await import('../ui/workspaces.js')).deleteWorkspace();
handlers.A.avColor = el => {
  void persistPersonalChange({ profile: { c: el.dataset.v } });
};
handlers.A.saveProfile = async () => {
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
