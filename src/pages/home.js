/* ---------- HOME ---------- */
import { DAY, TODAY, diffD, esc, fmtDate, fmtFullDate, parse } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { D, S, allTasks, canSee, isOver, pColor, progressOf, proj, visibleProjects } from '../core/store.js';
import { av, avStack, empty, pIcon, pStatus, prIcon, progBar } from '../ui/helpers.js';
import { sortTasks } from '../shell/view-engine.js';
import { actHtml, miniRow } from '../components/task-list.js';
import { readLayoutPreference, writeLayoutPreference } from '../core/view-layout-preferences.js';
import { A } from '../actions/actions.js';
import { render } from '../shell/render.js';

A.setHomeView = el => {
  if (!['personal', 'team'].includes(el.dataset.view)) return;
  writeLayoutPreference('homeView', el.dataset.view);
  render();
};

export function pageHome() {
  const h = new Date().getHours();
  const greet = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  const all = allTasks();
  const mineAll = all.filter(t => t.assignee === D().me);
  const activeP = visibleProjects().filter(p => canSee(p) && p.status !== 'complete');
  const open = all.filter(t => t.status !== 'done');
  const doneWk = all.filter(t => t.status === 'done' && t.completedAt && Date.now() - t.completedAt < 7 * DAY);
  const over = all.filter(isOver);
  const tab = S.ui.homeTab;
  const personal = readLayoutPreference('homeView', 'personal') !== 'team';
  const lists = {
    upcoming: sortTasks(
      mineAll.filter(t => t.status !== 'done' && !isOver(t)),
      { f: 'due', dir: 1 },
    ),
    overdue: mineAll.filter(isOver),
    completed: sortTasks(
      mineAll.filter(t => t.status === 'done'),
      { f: 'updated', dir: 1 },
    ),
  };
  const cur = lists[tab].slice(0, 7);
  const dl = (lab, a, b) => {
    const ts = sortTasks(
      open.filter(t => t.due && diffD(parse(t.due), TODAY) >= a && diffD(parse(t.due), TODAY) <= b),
      { f: 'priority', dir: 1 },
    );
    return { lab, ts };
  };
  const dls = [dl('Today', 0, 0), dl('Tomorrow', 1, 1), dl('This week', 2, 7)];
  return `<div class="page home-page">
    <div class="ph"><div><h1>${greet}, ${esc(S.prefs.name.split(' ')[0])}</h1><p><span class="num">${fmtFullDate(TODAY)}</span> · Here's what's happening across your workspace.</p></div>
      ${S.ui.currentUser?.role === 'viewer' ? '' : `<div class="acts"><button class="btn btn-secondary hide-m" data-a="invite">${ic('user-plus', 14)}Invite member</button><button class="btn btn-secondary hide-m" data-a="newProject">${ic('folder-plus', 14)}New project</button><button class="btn btn-primary" data-a="newTask">${ic('plus', 14)}New task</button></div>`}</div>
    <div class="seg home-view-switch" role="group" aria-label="Home view"><button data-a="setHomeView" data-view="personal" aria-pressed="${personal}" class="${personal ? 'on' : ''}">My work</button><button data-a="setHomeView" data-view="team" aria-pressed="${!personal}" class="${!personal ? 'on' : ''}">Team overview</button></div>
    <details class="home-team-summary" ${personal ? '' : 'open'}><summary>Team overview</summary><div class="stats" style="margin-bottom:16px">
      <button class="stat" data-a="go" data-r="projects"><span class="k">${ic('folder-kanban', 14)}Active projects</span><span class="v">${activeP.length}</span><span class="d">${activeP.filter(p => p.status === 'risk').length} at risk</span></button>
      <button class="stat" data-a="goTasks" data-f="open"><span class="k">${ic('circle-dashed', 14)}Open tasks</span><span class="v">${open.length}</span><span class="d">${open.filter(t => t.assignee === D().me).length} assigned to you</span></button>
      <button class="stat" data-a="goTasks" data-f="done"><span class="k">${ic('circle-check', 14)}Completed</span><span class="v">${doneWk.length}</span><span class="d up">this week</span></button>
      <button class="stat" data-a="goTasks" data-f="overdue"><span class="k">${ic('clock-alert', 14)}Overdue</span><span class="v" style="${over.length ? 'color:var(--red)' : ''}">${over.length}</span><span class="d ${over.length ? 'bad' : ''}">${over.length ? 'need attention' : 'all on track'}</span></button>
    </div></details>
    <div class="grid2">
      <div class="stack">
        <section class="panel" aria-labelledby="h-mytasks">
          <div class="panel-h"><h2 id="h-mytasks">My tasks</h2>
            <div class="acts"><div class="seg" role="tablist">${[
              ['upcoming', 'Upcoming'],
              ['overdue', 'Overdue'],
              ['completed', 'Completed'],
            ]
              .map(
                ([k, n]) =>
                  `<button role="tab" class="${tab === k ? 'on' : ''}" data-a="set" data-k="homeTab" data-v="${k}">${n} <span class="faint">${lists[k].length}</span></button>`,
              )
              .join('')}</div>
            <button class="ibtn ibtn-sm hide-m" data-a="go" data-r="mytasks" data-tip="Open My Tasks" aria-label="Open My Tasks">${ic('arrow-up-right', 15)}</button></div></div>
${cur.length ? cur.map(t => miniRow(t, { av: false })).join('') : empty(tab === 'overdue' ? 'circle-check' : 'list-checks', tab === 'overdue' ? 'Nothing overdue' : 'No tasks here', tab === 'overdue' ? 'Every task assigned to you is on schedule.' : 'Add a task to get things moving.', `<button class="btn btn-secondary" data-a="go" data-r="tasks">Browse workspace tasks</button>`, 'sm')}
          ${lists[tab].length > 7 ? `<button class="addrow" style="padding-left:14px;border-top:1px solid var(--divider);border-bottom:0" data-a="go" data-r="mytasks">View all ${lists[tab].length} tasks ${ic('arrow-right', 13)}</button>` : ''}
        </section>
        <section class="panel">
          <div class="panel-h"><h2>Project progress</h2><div class="acts"><button class="btn btn-sm btn-ghost" data-a="go" data-r="projects">All projects</button></div></div>
          <div class="home-projects-wrap"><table class="perm-t home-projects-table"><thead><tr><th style="padding-left:14px">Project</th><th style="text-align:left">Status</th><th style="text-align:left;width:26%">Progress</th><th style="text-align:left">Due</th><th style="text-align:right;padding-right:14px">Team</th></tr></thead><tbody>
          ${activeP
            .filter(canSee)
            .map(p => {
              const pr = progressOf(p.id);
              return `<tr data-a="go" data-r="project" data-id="${p.id}" data-tab="overview"><td class="home-project-name"><span class="row">${pIcon(p, '', 14)}<b style="font-weight:500">${esc(p.name)}</b></span></td><td class="home-project-status">${pStatus(p.status)}</td><td class="home-project-progress"><span class="row">${progBar(pr, p.status === 'risk' ? 'red' : '')}<span class="num faint" style="font-size:11.5px;width:30px">${pr}%</span></span></td><td class="home-project-due num muted"><span class="home-project-meta-icon">${ic('calendar', 12)}</span>${fmtDate(p.due)}</td><td class="home-project-team">${avStack(p.members, 3)}</td></tr>`;
            })
            .join('')}
          </tbody></table></div>
        </section>
      </div>
      <div class="stack">
        <section class="panel">
          <div class="panel-h"><h2>Upcoming deadlines</h2><div class="acts"><button class="btn btn-sm btn-ghost" data-a="go" data-r="calendar">${ic('calendar', 13)}Calendar</button></div></div>
          <div class="panel-b" style="padding-bottom:6px">
          ${dls
            .map(
              g => `<div style="margin-bottom:10px"><div class="row" style="font-size:11.5px;font-weight:600;color:var(--text-2);margin-bottom:4px">${g.lab}<span class="faint" style="font-weight:500">${g.ts.length}</span></div>
            ${
              g.ts.length
                ? g.ts
                    .slice(0, 4)
                    .map(
                      t =>
                        `<button type="button" class="row home-deadline-task" data-a="openTask" data-id="${t.id}"><span class="pdot" style="--c:${pColor(proj(t.project))}"></span><span class="trunc grow" translate="no">${esc(t.title)}</span>${prIcon(t.priority, 13)}${av(t.assignee, 'sm', false)}</button>`,
                    )
                    .join('') + (g.ts.length > 4 ? `<div class="faint" style="font-size:11.5px;padding-left:16px">+${g.ts.length - 4} more</div>` : '')
                : `<div class="faint" style="font-size:12.5px;padding:4px 0 2px">Nothing due</div>`
            }</div>`,
            )
            .join('')}
          </div>
        </section>
        <section class="panel">
          <div class="panel-h"><h2>Recent activity</h2><div class="acts"><button class="btn btn-sm btn-ghost" data-a="go" data-r="activity">View all</button></div></div>
          <div class="panel-b feed lined">${D()
            .activity.slice(0, 7)
            .map(a => actHtml(a, { proj: true }))
            .join('')}</div>
        </section>
      </div>
    </div>
  </div>`;
}
