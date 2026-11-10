import { A, IN, createProject, createTask, confirmDlg, snapshot, restore, moveToTrash, deleteTasks } from './actions.js';
import { $, uid } from '../core/utils.js';
import { D, S, canSee, proj, save, visibleProjects, teamsList, me, tasksOf } from '../core/store.js';
import { canEditProject } from '../shared/project-access.js';
import { applyWorkListIntent } from '../shared/work-list-intent.js';
import { taskCycleValue } from '../shared/task-cycles.js';
import { viewOf } from '../shell/view-engine.js';
import { go, render } from '../shell/render.js';
import { primaryTeamId } from '../shared/team-relations.js';
import { TEMPLATES, openModal } from '../overlays/modals.js';
import { mutate, mutateTaskCommand, toast } from '../ui/toast.js';

A.saveView = el => {
  if (!canEditProject(proj(el.dataset.id), D().me, S.ui.currentUser?.role || 'viewer'))
    return toast('You do not have permission to save workspace changes.', { kind: 'err' });
  const tab = S.ui.params.tab || '',
    k = tab.startsWith('v:') && D().savedViews.some(view => view.id === tab.slice(2) && view.project === el.dataset.id) ? 's' + tab : 'p:' + el.dataset.id;
  openModal({ type: 'saveView', pid: el.dataset.id, sourceKey: k, nf: viewOf(k).filters.length });
};
A.saveViewSubmit = () => {
  const m = S.ui.modals[S.ui.modals.length - 1];
  if (!canEditProject(proj(m.pid), D().me, S.ui.currentUser?.role || 'viewer'))
    return toast('You do not have permission to save workspace changes.', { kind: 'err' });
  const name = $('#sv-name').value.trim() || 'Untitled view';
  const type = $('#sv-type').value;
  const sv = { id: uid('v'), project: m.pid, name, type, filters: JSON.parse(JSON.stringify(viewOf(m.sourceKey || 'p:' + m.pid).filters)) };
  D().savedViews.push(sv);
  save();
  S.ui.modals.pop();
  go('project', { id: m.pid, tab: 'v:' + sv.id }, { tab: true });
  toast(`Saved view “${name}”`);
};
A.renameView = el => {
  const v = D().savedViews.find(x => x.id === el.dataset.id);
  if (!v || !canEditProject(proj(v.project), D().me, S.ui.currentUser?.role || 'viewer')) return;
  S.ui.pop = null;
  openModal({
    type: 'prompt',
    title: 'Rename view',
    label: 'View name',
    value: v.name,
    run: val => {
      if (val && D().savedViews.includes(v) && canEditProject(proj(v.project), D().me, S.ui.currentUser?.role || 'viewer')) {
        v.name = val;
        save();
      }
    },
  });
};
A.delView = el => {
  const v = D().savedViews.find(x => x.id === el.dataset.id);
  if (!v || !canEditProject(proj(v.project), D().me, S.ui.currentUser?.role || 'viewer')) return;
  S.ui.pop = null;
  D().savedViews = D().savedViews.filter(x => x !== v);
  save();
  if (S.ui.params.tab === 'v:' + v.id) go('project', { id: v.project, tab: 'list' }, { tab: true });
  else render();
  toast(`Deleted view “${v.name}”`);
};

A.goTasks = el => {
  const { f: kind, project, assignee } = el.dataset;
  if (project && !visibleProjects().some(p => p.id === project && canSee(p))) return;
  if (assignee && !D().members.some(m => m.id === assignee)) return;
  applyWorkListIntent(viewOf('tasks'), { kind, project, assignee });
  for (const map of [S.ui.listPages, S.ui.collapsedGroups]) {
    for (const key of Object.keys(map || {})) if (key.startsWith('tasks:')) delete map[key];
  }
  go('tasks');
};
A.goFilteredList = el => {
  const v = viewOf('p:' + el.dataset.id);
  v.q = '';
  v.filters = [{ f: 'status', op: 'is', v: [el.dataset.st] }];
  v.group = 'status';
  go('project', { id: el.dataset.id, tab: 'list' }, { tab: true });
};
A.goCycleTasks = el => {
  const project = proj(el.dataset.project),
    cycleId = el.dataset.id || '';
  if (!project || !canSee(project) || (cycleId && !project.workflow?.cycles?.some(cycle => cycle.id === cycleId))) return;
  const view = applyWorkListIntent(viewOf('p:' + project.id));
  view.filters = [{ f: 'cycleId', op: 'is', v: [taskCycleValue(project.id, cycleId)] }];
  view.group = 'status';
  const prefix = 'p:' + project.id + ':';
  for (const map of [S.ui.listPages, S.ui.collapsedGroups]) {
    for (const key of Object.keys(map || {})) if (key.startsWith(prefix)) delete map[key];
  }
  save();
  go('project', { id: project.id, tab: 'list' }, { tab: true });
};

A.newProject = () => {
  if (S.ui.currentUser?.role === 'editor' && D().ws.permissions?.createProjects === false) {
    toast('You do not have permission to save workspace changes.', { kind: 'err' });
    return;
  }
  const availableTeams = teamsList();
  const initialTeam = primaryTeamId(availableTeams, me().team);
  S.ui.pform = { name: '', desc: '', icon: 'folder', iconImage: null, color: 'indigo', team: initialTeam, lead: D().me, due: '', tmpl: 'blank' };
  S.ui.projectIconQuery = '';
  S.ui.errors = {};
  S.ui.pop = null;
  openModal({ type: 'project' });
};
A.editProject = el => {
  const p = proj(el.dataset.id);
  S.ui.pop = null;
  S.ui.pform = {
    name: p.name,
    desc: p.desc,
    icon: p.icon,
    iconImage: p.iconImage || null,
    color: p.color,
    team: p.team,
    lead: p.lead,
    due: p.due,
    tmpl: 'blank',
  };
  S.ui.projectIconQuery = '';
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
  if (el.dataset.f === 'icon') S.ui.pform.iconImage = null;
  if (el.dataset.f === 'color') {
    S.ui.pform.colorDraft = '';
    S.ui.errors.projectColor = null;
  }
  if (el.dataset.f === 'tmpl') {
    const t = TEMPLATES.find(x => x.id === el.dataset.v);
    if (t && S.ui.pform.icon === 'folder') S.ui.pform.icon = t.icon === 'file' ? 'folder' : t.icon;
  }
  render();
};
A.dupProject = el => {
  const p = proj(el.dataset.id);
  S.ui.pop = null;
  let n;
  if (
    !mutateTaskCommand(() => {
      n = createProject({ ...p, name: p.name + ' copy' }, 'blank');
      tasksOf(p.id).forEach(t => createTask({ ...JSON.parse(JSON.stringify(t)), id: uid('t'), key: undefined, project: n.id, status: 'todo', cycleId: '' }));
    })
  )
    return;
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
