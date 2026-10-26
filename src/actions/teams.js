/* =====================================================================
   ACTIONS · TEAMS: create, edit, delete
   ===================================================================== */
import { $, uid } from '../core/utils.js';
import { PCOLORS } from '../core/constants.js';
import { D, S, team, teamsList } from '../core/store.js';
import { mutate, toast } from '../ui/toast.js';
import { go, render } from '../shell/render.js';
import { openModal } from '../overlays/modals.js';
import { A, IN, confirmDlg, restore, snapshot } from './actions.js';
import { assignTeamRelations } from '../shared/team-relations.js';
import { canManageTeams } from '../shared/workspace-permissions.js';
const requireTeamAdmin = () => {
  if (canManageTeams(S.ui.currentUser?.role)) return true;
  toast('Only administrators can manage teams.', { kind: 'info' });
  return false;
};

A.newTeam = () => {
  if (!requireTeamAdmin()) return;
  S.ui.pop = null;
  S.ui.errors = {};
  S.ui.tform = { name: '', desc: '', icon: 'users', color: 'teal', members: [], projects: [] };
  openModal({ type: 'team' });
};
A.editTeam = el => {
  if (!requireTeamAdmin()) return;
  const t = team(el.dataset.id);
  if (!t) return;
  S.ui.pop = null;
  S.ui.errors = {};
  S.ui.tform = {
    name: t.name,
    desc: t.desc,
    icon: t.icon,
    color: Object.keys(PCOLORS).find(k => PCOLORS[k] === t.c) || 'slate',
    members: D()
      .members.filter(m => m.team === t.id && !['deactivated', 'removed'].includes(m.status))
      .map(m => m.id),
    projects: D()
      .projects.filter(project => project.team === t.id && !project.archived)
      .map(project => project.id),
  };
  openModal({ type: 'team', edit: t.id });
};
IN.tform = el => {
  S.ui.tform[el.dataset.f] = el.value;
  if (el.dataset.f === 'name' && S.ui.errors.tname && el.value.trim()) {
    S.ui.errors.tname = null;
    render();
  }
};
A.tformSet = el => {
  S.ui.tform[el.dataset.f] = el.dataset.v;
  render();
};
A.tformMember = el => {
  const l = S.ui.tform.members;
  const id = el.dataset.id;
  S.ui.tform.members = l.includes(id) ? l.filter(x => x !== id) : [...l, id];
  render();
};
A.tformProject = el => {
  const projects = S.ui.tform.projects || [];
  const id = el.dataset.id;
  S.ui.tform.projects = projects.includes(id) ? projects.filter(projectId => projectId !== id) : [...projects, id];
  render();
};
A.submitTeam = () => {
  if (!requireTeamAdmin()) return;
  const m = S.ui.modals[S.ui.modals.length - 1];
  const f = S.ui.tform;
  f.name = ($('#tm-name')?.value || '').trim();
  f.desc = ($('#tm-desc')?.value || '').trim();
  if (!f.name) {
    S.ui.errors.tname = 'Give the team a name';
    render();
    $('#tm-name')?.focus();
    return;
  }
  if (teamsList().some(t => t.name.toLowerCase() === f.name.toLowerCase() && t.id !== m.edit)) {
    S.ui.errors.tname = `A team called “${f.name}” already exists`;
    render();
    $('#tm-name')?.focus();
    return;
  }
  let t;
  if (m.edit && !team(m.edit)) {
    S.ui.modals.pop();
    render();
    toast('This team no longer exists. Refresh the list and try again.', { kind: 'err' });
    return;
  }
  const ok = mutate(() => {
    if (m.edit) {
      t = team(m.edit);
      Object.assign(t, { name: f.name, desc: f.desc, icon: f.icon, c: PCOLORS[f.color] });
    } else {
      t = { id: uid('tm'), name: f.name, desc: f.desc || 'No description yet.', icon: f.icon, c: PCOLORS[f.color] };
      teamsList().push(t);
    }
    assignTeamRelations(D(), t.id, f.members, f.projects || []);
  });
  if (!ok) return;
  S.ui.modals.pop();
  if (m.edit) {
    render();
    toast(`Saved ${t.name}`);
  } else {
    go('team', { id: t.id });
    toast(`Created ${t.name}`);
  }
};
A.delTeam = el => {
  if (!requireTeamAdmin()) return;
  const t = team(el.dataset.id);
  if (!t) return;
  S.ui.modals.pop();
  confirmDlg({
    title: `Delete ${t.name}?`,
    body: 'People and projects will be unlinked from this team, not deleted. Workspace access and tasks will be preserved.',
    ok: 'Delete team',
    danger: true,
    icon: 'users',
    run: () => {
      const snap = snapshot();
      if (
        mutate(() => {
          D().teams = teamsList().filter(x => x.id !== t.id);
          D().members.forEach(x => {
            if (x.team === t.id) x.team = '';
          });
          D().projects.forEach(p => {
            if (p.team === t.id) p.team = '';
          });
        })
      ) {
        if (S.ui.route === 'team') go('teams');
        toast(`Deleted ${t.name}`, { action: 'Undo', onAction: () => restore(snap) });
      }
    },
  });
};
