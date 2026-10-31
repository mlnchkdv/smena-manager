import { actionLabel } from '../ui/action-label.js';
/* ---------- MEMBERS / PROFILE / TEAMS ---------- */
import { ago, esc } from '../core/utils.js';
import { recordedActivityIndex } from '../shared/recorded-activity.js';
import { ic } from '../core/icons.js';
import { ROLES } from '../core/constants.js';
import { D, S, TM, allTasks, canSee, isOver, mem, progressOf, team, teamsList, visibleProjects } from '../core/store.js';
import { av, avStack, empty, pIcon, pStatus, progBar } from '../ui/helpers.js';
import { sortTasks } from '../shell/view-engine.js';
import { actHtml, miniRow } from '../components/task-list.js';
import { page404 } from './errors.js';
import { t as tr } from '../core/i18n.js';
import { canManageTeams } from '../shared/workspace-permissions.js';
import { segmentedControl } from '../ui/segmented-control.js';

const teamDescription = value => (!value || value === 'No description yet.' ? tr('No description yet.') : value);
const recordedMemberLabel = (member, times) =>
  member.id === D().me && S.ui.currentUser ? tr('Current session') : times.get(member.id) ? ago(times.get(member.id)) : tr('Activity unavailable');

const memberAccessBadge = m =>
  m.status === 'invited'
    ? '<span class="badge amber">Invited</span>'
    : m.status === 'deactivated'
      ? '<span class="badge gray">Access deactivated</span>'
      : '<span class="badge green">Access active</span>';
const memberRoleControl = (m, isAdmin) =>
  isAdmin && m.role !== 'Owner' && m.id !== D().me
    ? `<button class="pillbtn bordered" data-a="pop" data-pop="role" data-id="${esc(m.id)}" aria-label="${actionLabel('Role', m.name, tr(m.role))}">${esc(m.role)}${ic('chevron-down', 12)}</button>`
    : `<span class="badge">${esc(m.role)}</span>`;

function mobileMembers(members, isAdmin, activity) {
  if (!members.length) return `<div class="only-m">${empty('search-x', 'No results found', 'No members match that search.', '', 'sm')}</div>`;
  return `<div class="only-m member-mobile-list">${members.map(m => `<article class="panel member-mobile-card" aria-labelledby="member-card-name-${esc(m.id)}"><div class="member-mobile-heading"><button class="member-mobile-open" aria-labelledby="member-card-name-${esc(m.id)}" data-a="go" data-r="member" data-id="${esc(m.id)}">${av(m.id, 'md', false)}<span><b id="member-card-name-${esc(m.id)}" translate="no">${esc(m.name)}</b>${m.id === D().me ? '<span class="faint">(you)</span>' : ''}<small translate="no">${esc(m.email)}</small></span></button><button class="ibtn" data-a="ctxBtn" data-ctx="member" data-id="${esc(m.id)}" aria-label="${actionLabel('Member options', m.name, m.email)}" title="${actionLabel('Member options', m.name, m.email)}">${ic('ellipsis', 15)}</button></div><div class="member-mobile-meta">${memberRoleControl(m, isAdmin)}${memberAccessBadge(m)}</div><div class="row muted">${ic(TM[m.team].icon, 13)}<span ${team(m.team) ? 'translate="no"' : ''}>${esc(TM[m.team].name)}</span></div><details class="member-mobile-details"><summary>Details</summary><dl><div><dt>Active projects</dt><dd>${visibleProjects().filter(p => p.members.includes(m.id) && p.status !== 'complete').length}</dd></div><div><dt>Open tasks</dt><dd>${allTasks().filter(t => t.assignee === m.id && t.status !== 'done').length}</dd></div><div><dt>Recorded activity</dt><dd>${recordedMemberLabel(m, activity)}</dd></div></dl></details></article>`).join('')}</div>`;
}

export function pageMembers() {
  const u = S.ui;
  const q = (u.memQ || '').toLowerCase();
  const role = u.memRole || 'all';
  const ms = D().members.filter(m => (role === 'all' || m.role === role) && (!q || m.name.toLowerCase().includes(q) || m.email.includes(q)));
  const isAdmin = S.ui.currentUser?.role === 'admin';
  const tab = u.membersTab;
  const activity = recordedActivityIndex(D(), visibleProjects().filter(canSee)).members;
  return `<div class="page wide" style="max-width:1200px">
    <div class="ph compact-page-head"><div><h1>Members</h1><p>${D().members.length} people in ${esc(D().ws.name)}</p></div>${isAdmin ? `<div class="acts"><button class="btn btn-primary" data-a="invite" aria-label="Add access" title="Add access">${ic('user-plus', 14)}<span class="hide-m">Add access</span></button></div>` : ''}</div>
    <div class="tabs" style="margin-bottom:14px">${[
      ['members', 'Members'],
      ['teams', 'Teams'],
      ['roles', 'Roles & permissions'],
    ]
      .map(([k, n]) => `<button class="tab ${tab === k ? 'on' : ''}" data-a="set" data-k="membersTab" data-v="${k}">${n}</button>`)
      .join('')}</div>
    ${
      tab === 'teams'
        ? `<div class="row" style="margin-bottom:12px"><span class="muted" style="font-size:13px">${teamsList().length} teams</span><span class="sp"></span><button class="btn btn-secondary btn-sm" data-a="newTeam">${ic('plus', 13)}New team</button></div>${teamsGrid()}`
        : tab === 'roles'
          ? permsTable()
          : `
    <div class="row" style="margin-bottom:12px;gap:8px;flex-wrap:wrap"><div class="inwrap">${ic('search', 13)}<input class="input search-sm" id="mem-q" data-in="memQ" placeholder="Search by name or email" value="${esc(u.memQ || '')}" aria-label="Search members"></div>
      ${segmentedControl({ label: 'Filter by role', key: 'memRole', value: role, items: ['all', ...ROLES].map(r => [r, r === 'all' ? 'All' : r]) })}</div>
    ${mobileMembers(ms, isAdmin, activity)}<div class="panel hide-m" style="overflow-x:auto">${
      ms.length
        ? `<table class="perm-t" style="min-width:880px"><thead><tr><th style="padding-left:14px">Member</th><th style="text-align:left">Role</th><th style="text-align:left">Team</th><th>Active projects</th><th>Tasks</th><th style="text-align:left">Recorded activity</th><th style="text-align:left">Status</th><th></th></tr></thead><tbody>
    ${ms
      .map(m => {
        const ap = visibleProjects().filter(p => p.members.includes(m.id) && p.status !== 'complete').length;
        const ot = allTasks().filter(t => t.assignee === m.id && t.status !== 'done').length;
        return `<tr data-ctx="member" data-id="${m.id}"><td style="padding-left:14px"><button class="row" data-a="go" data-r="member" data-id="${m.id}" style="gap:10px;text-align:left">${av(m.id, 'md', false)}<span class="col"><b style="font-weight:500"><span translate="no">${esc(m.name)}</span>${m.id === D().me ? ' <span class="faint" style="font-weight:400">(you)</span>' : ''}</b><span class="faint" style="font-size:12px" translate="no">${esc(m.email)}</span></span></button></td>
      <td style="text-align:left">${isAdmin && m.role !== 'Owner' && m.id !== D().me ? `<button class="pillbtn bordered" data-a="pop" data-pop="role" data-id="${m.id}">${m.role}${ic('chevron-down', 12)}</button>` : `<span class="pillbtn">${m.role === 'Owner' ? ic('crown', 13) : ''}${m.role}</span>`}</td>
      <td style="text-align:left"><span class="row">${ic(TM[m.team].icon, 13)}<span ${team(m.team) ? 'translate="no"' : ''}>${esc(TM[m.team].name)}</span></span></td><td class="num">${ap}</td><td class="num">${ot}</td>
      <td style="text-align:left" class="muted">${recordedMemberLabel(m, activity)}</td>
      <td style="text-align:left">${m.status === 'invited' ? '<span class="badge amber"><span class="dot"></span>Invited</span>' : m.status === 'deactivated' ? '<span class="badge gray">Access deactivated</span>' : '<span class="badge green"><span class="dot"></span>Access active</span>'}</td>
      <td><button class="ibtn ibtn-sm" data-a="ctxBtn" data-ctx="member" data-id="${m.id}" aria-label="${actionLabel('Member options', m.name, m.email)}" title="${actionLabel('Member options', m.name, m.email)}">${ic('ellipsis', 14)}</button></td></tr>`;
      })
      .join('')}
    </tbody></table>`
        : empty('search-x', 'No results found', 'No members match that search.', '', 'sm')
    }</div>`
    }
  </div>`;
}
export function permsTable() {
  const archivable = (S.ui.activeWorkspace || 'default') !== 'default';
  const rows = [
    ['View projects & tasks', 1, 1, 1, 1],
    ['Comment on tasks', 1, 1, 1, 0],
    ['Create and edit tasks', 1, 1, 1, 0],
    ['Create projects', 1, 1, D().ws.permissions?.createProjects !== false, 0],
    ['Create workspace', 1, 1, 1, 0],
    ['Manage sign-in access', 1, 1, 0, 0],
    ['Manage roles', 1, 1, 0, 0],
    ['Workspace settings', 1, 1, 0, 0],
    ['Archive this workspace', archivable, archivable, 0, 0],
    ['Clear workspace content', 1, 1, 0, 0],
  ];
  return `<p class="muted">Permissions apply to the current workspace. Project visibility, commenting and editing also depend on project access.</p><p class="hint">Creating a workspace makes you its owner; it does not change your role here. Guests have read-only project access.</p>${!archivable ? '<p class="hint">The original workspace cannot be archived.</p>' : ''}<p class="hint">Clearing content retains the workspace identity and member access. Archiving retains its content.</p><div class="panel" style="overflow-x:auto" role="region" aria-label="Role permissions" tabindex="0"><table class="perm-t" style="min-width:560px"><caption class="sr">Roles in the current workspace</caption><thead><tr><th scope="col" style="padding-left:14px">Permission</th>${ROLES.map(r => `<th scope="col">${r}</th>`).join('')}</tr></thead><tbody>${rows
    .map(
      r =>
        `<tr><th scope="row" style="padding-left:14px;text-align:left;font-weight:400">${r[0]}</th>${r
          .slice(1)
          .map(
            v =>
              `<td>${v ? `<span style="color:var(--green);display:inline-flex" aria-label="Allowed">${ic('check', 15)}</span>` : `<span class="faint" style="display:inline-flex" aria-label="Not allowed">${ic('minus', 15)}</span>`}</td>`,
          )
          .join('')}</tr>`,
    )
    .join('')}</tbody></table></div>`;
}
export function teamsGrid() {
  return `<div class="pgrid">${teamsList()
    .map(t => {
      const ms = D().members.filter(m => m.team === t.id);
      const ps = visibleProjects().filter(p => p.team === t.id);
      return `<div class="pcard" data-a="go" data-r="team" data-id="${t.id}" role="link" tabindex="0"><div class="row"><span class="picon" style="--c:${t.c}">${ic(t.icon, 15)}</span><b style="font-weight:600;font-size:14px" translate="no">${esc(t.name)}</b></div><div class="desc" translate="no">${esc(teamDescription(t.desc))}</div><div class="foot"><span class="row" style="gap:4px">${ic('users', 12)}${ms.length} members</span><span class="row" style="gap:4px">${ic('folder', 12)}${ps.length} projects</span><span class="sp"></span>${avStack(
        ms.map(m => m.id),
        4,
      )}</div></div>`;
    })
    .join('')}</div>`;
}
export function pageTeams() {
  const canManage = canManageTeams(S.ui.currentUser?.role);
  return `<div class="page"><div class="ph"><div><h1>Teams</h1><p>Groups of people who work on projects together.</p></div>${canManage ? `<div class="acts"><button class="btn btn-primary" data-a="newTeam">${ic('plus', 14)}New team</button></div>` : ''}</div>${teamsList().length ? teamsGrid() : `<div class="panel">${empty('users', 'No teams yet', 'An administrator can create a team to group people and projects.', canManage ? `<button class="btn btn-primary btn-sm" data-a="newTeam">${ic('plus', 14)}New team</button>` : '')}</div>`}</div>`;
}
export function pageTeam() {
  const t = team(S.ui.params.id);
  if (!t) return page404();
  const ms = D().members.filter(m => m.team === t.id);
  const ps = visibleProjects().filter(p => p.team === t.id);
  const ts = allTasks().filter(x => ms.some(m => m.id === x.assignee) && x.status !== 'done');
  return `<div class="page">
    <div class="ph"><div class="row" style="gap:12px"><span class="picon lg" style="--c:${t.c}">${ic(t.icon, 18)}</span><div><h1 translate="no">${esc(t.name)}</h1><p style="margin:2px 0 0" translate="no">${esc(teamDescription(t.desc))}</p></div></div>${canManageTeams(S.ui.currentUser?.role) ? `<div class="acts"><button class="btn btn-secondary" data-a="editTeam" data-id="${t.id}">${ic('pencil', 14)}Edit team</button><button class="btn btn-secondary" data-a="invite">${ic('user-plus', 14)}Add access</button></div>` : ''}</div>
    <div class="grid2"><div class="stack">
      <section class="panel"><div class="panel-h"><h2>Projects</h2><span class="faint">${ps.length}</span></div>${ps.map(p => `<div class="mini" data-a="go" data-r="project" data-id="${p.id}">${pIcon(p, '', 14)}<span class="tt" translate="no">${esc(p.name)}</span>${pStatus(p.status)}<span class="row" style="width:120px">${progBar(progressOf(p.id))}</span></div>`).join('') || '<div class="panel-b faint">No projects</div>'}</section>
      <section class="panel"><div class="panel-h"><h2>Open tasks</h2><span class="faint">${ts.length}</span></div>${sortTasks(ts, { f: 'due', dir: 1 })
        .slice(0, 8)
        .map(x => miniRow(x))
        .join('')}</section>
    </div>
    <section class="panel" style="align-self:start"><div class="panel-h"><h2>Members</h2><span class="faint">${ms.length}</span></div>${ms.map(m => `<div class="mini" style="min-height:48px" data-a="go" data-r="member" data-id="${m.id}">${av(m.id, 'md', false)}<div class="grow"><div style="font-weight:500" translate="no">${esc(m.name)}</div><div class="faint" style="font-size:12px" translate="no">${esc(m.title)}</div></div><span class="badge">${m.role}</span></div>`).join('')}</section></div>
  </div>`;
}
export function pageMember() {
  const m = mem(S.ui.params.id);
  if (!m) return page404();
  const activity = recordedActivityIndex(D(), visibleProjects().filter(canSee)).members;
  const ts = allTasks().filter(t => t.assignee === m.id);
  const open = ts.filter(t => t.status !== 'done');
  const done = ts.filter(t => t.status === 'done');
  const ps = visibleProjects().filter(p => p.members.includes(m.id) && p.status !== 'complete' && canSee(p));
  const acts = D()
    .activity.filter(a => a.by === m.id)
    .slice(0, 8);
  const tab = S.ui.memTab || 'assigned';
  return `<div class="page member-profile">
    <div class="row member-profile-head" style="gap:18px;margin-bottom:22px;flex-wrap:wrap;align-items:flex-start">
      ${av(m.id, 'xl ' + (m.last != null && m.last < 5 ? 'presence' : ''), false)}
      <div class="grow member-profile-identity"><div class="row" style="gap:10px;flex-wrap:wrap"><h1 style="font-size:var(--fs-2xl);margin:0;font-weight:600;letter-spacing:-.02em" translate="no">${esc(m.name)}</h1><span class="badge">${m.role === 'Owner' ? ic('crown', 11) : ''}${m.role}</span>${m.status === 'invited' ? '<span class="badge amber">Invite pending</span>' : ''}</div>
        <div class="muted" style="margin-top:3px"><span translate="no">${esc(m.title)}</span> · <span ${team(m.team) ? 'translate="no"' : ''}>${esc(TM[m.team].name)}</span></div>
        <div class="row faint" style="margin-top:8px;gap:14px;font-size:12.5px;flex-wrap:wrap"><span class="row member-profile-email" style="gap:5px">${ic('mail', 13)}<span style="user-select:all" translate="no">${esc(m.email)}</span></span>${m.tz?.trim() ? `<span class="row" style="gap:5px">${ic('map-pin', 13)}<span translate="no">${esc(m.tz)}</span></span>` : ''}<span class="row" style="gap:5px">${ic('clock', 13)}${tr('Recorded activity')}: ${recordedMemberLabel(m, activity)}</span></div></div>
      <div class="member-profile-actions"><button class="btn btn-secondary" data-a="copyText" data-text="${esc(m.email)}" aria-label="Copy email" title="Copy email">${ic('copy', 14)}<span class="hide-m">Copy email</span><span class="only-m">Copy</span></button><button class="btn btn-primary" data-a="newTask" data-assignee="${m.id}">${ic('plus', 14)}Assign task</button><button class="ibtn" data-a="ctxBtn" data-ctx="member" data-id="${m.id}" aria-label="More">${ic('ellipsis', 16)}</button></div>
    </div>
    <div class="stats" style="margin-bottom:18px">
      <div class="stat"><span class="k">Active projects</span><span class="v">${ps.length}</span></div>
      <div class="stat"><span class="k">Assigned tasks</span><span class="v">${open.length}</span></div>
      <div class="stat"><span class="k">Completed tasks</span><span class="v">${done.length}</span></div>
      <div class="stat"><span class="k">Overdue</span><span class="v" style="${open.filter(isOver).length ? 'color:var(--red)' : ''}">${open.filter(isOver).length}</span></div>
    </div>
    <div class="grid2"><section class="panel"><div class="tabs" style="padding:0 8px">${[
      ['assigned', `Assigned · ${open.length}`],
      ['completed', `Completed · ${done.length}`],
    ]
      .map(([k, n]) => `<button class="tab ${tab === k ? 'on' : ''}" data-a="set" data-k="memTab" data-v="${k}">${n}</button>`)
      .join('')}</div>
      ${(tab === 'assigned' ? sortTasks(open, { f: 'due', dir: 1 }) : done).map(t => miniRow(t, { av: false })).join('') || empty('list-checks', 'No tasks here', 'Nothing to show in this list.', '', 'sm')}</section>
      <div class="stack"><section class="panel"><div class="panel-h"><h2>Active projects</h2></div>${ps.map(p => `<div class="mini" data-a="go" data-r="project" data-id="${p.id}">${pIcon(p, '', 14)}<span class="tt" translate="no">${esc(p.name)}</span><span class="faint" style="font-size:12px">${p.lead === m.id ? 'Lead' : 'Member'}</span></div>`).join('') || '<div class="panel-b faint">No active projects</div>'}</section>
      <section class="panel"><div class="panel-h"><h2>Recent activity</h2></div><div class="panel-b feed">${acts.map(a => actHtml(a)).join('') || '<span class="faint">No recent activity</span>'}</div></section></div></div>
  </div>`;
}
