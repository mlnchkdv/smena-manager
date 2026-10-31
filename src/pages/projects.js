import { appLocationPath } from '../shared/app-location.js';
/* ---------- PROJECTS ---------- */
import { ago, esc, fmtDate } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { PSTAT } from '../core/constants.js';
import { D, S, TM, canSee, mem, progressOf, tasksOf, visibleProjects } from '../core/store.js';
import { recordedActivityIndex, compareProjectActivity } from '../shared/recorded-activity.js';
import { locale, t } from '../core/i18n.js';
import { av, avStack, empty, pIcon, pStatus, progBar } from '../ui/helpers.js';
import { collectionOptions } from '../ui/collection-layout.js';

const activityLabel = at => (at ? ago(at) : t('Activity unavailable'));
export function projectCard(p, at) {
  const ts = tasksOf(p.id);
  const pr = progressOf(p.id);
  const open = ts.filter(t => t.status !== 'done').length;
  const locked = !canSee(p);
  const href = appLocationPath(D(), { route: 'project', params: { id: p.id } }),
    name = esc(p.name),
    openLabel = esc(`${t('Open project')}: ${p.name}`),
    description = !p.desc || p.desc === 'No description yet.' ? t('No description yet.') : p.desc,
    due = fmtDate(p.due),
    activity = locked ? '—' : activityLabel(at);
  return `<article class="pcard project-card" data-ctx="project" data-id="${esc(p.id)}" aria-label="${name}">
    <div class="project-card-head">${pIcon(p)}<div class="project-card-identity"><div class="project-card-title-row"><h2><a class="project-card-link" href="${esc(href)}" data-a="go" data-r="project" data-id="${esc(p.id)}" aria-label="${name}" title="${name}" translate="no">${name}</a></h2>${p.fav ? `<span style="color:var(--amber)">${ic('star', 12)}</span>` : ''}${p.private ? `<span class="faint" data-tip="Private project">${ic('lock', 12)}</span>` : ''}</div>${pStatus(p.status)}</div><button class="ibtn ibtn-sm project-card-menu" data-a="ctxBtn" data-ctx="project" data-id="${esc(p.id)}" aria-label="${esc(t('Project options'))}: ${name}" title="${esc(t('Project options'))}">${ic('ellipsis', 16)}</button></div>
    <p class="desc" translate="no">${esc(description)}</p>
    ${locked ? `<div class="row faint project-card-progress">${ic('lock', 12)}<span>Restricted — request access to see tasks</span></div>` : `<div class="project-card-progress">${progBar(pr, p.status === 'complete' ? 'green' : p.status === 'risk' ? 'red' : '')}<span class="num">${pr}%</span></div>`}
    <div class="foot project-card-foot"><div class="project-card-stats"><span class="project-card-count" aria-label="${esc(t('Tasks'))}: ${locked ? '—' : `${ts.length - open}/${ts.length}`}">${ic('circle-check', 12)}<span class="num">${locked ? '—' : `${ts.length - open}/${ts.length}`}</span></span>${p.due ? `<span class="project-card-due" title="${esc(t('Due date'))}: ${esc(due)}">${ic('calendar', 12)}<time datetime="${esc(p.due)}" translate="no">${esc(due)}</time></span>` : ''}</div><div class="project-card-secondary"><span class="project-card-activity" title="${esc(t('Last recorded activity'))}">${ic('clock', 12)}<span translate="no">${esc(activity)}</span></span><a class="project-card-members" href="${esc(href)}" data-a="go" data-r="project" data-id="${esc(p.id)}" tabindex="-1" aria-label="${openLabel}">${avStack(p.members, 3)}</a></div></div>
  </article>`;
}
export function pageProjects() {
  const u = S.ui;
  const q = (u.projQ || '').toLowerCase();
  const st = u.projStatus || 'all';
  const sort = u.projSort || 'recent';
  const times = recordedActivityIndex(D(), visibleProjects().filter(canSee)).projects;
  let ps = visibleProjects().filter(p => (st === 'all' || p.status === st) && (!q || p.name.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q)));
  const sorter = { name: p => p.name, due: p => p.due || '9999', progress: p => -progressOf(p.id) }[sort];
  ps.sort((a, b) =>
    sort === 'recent'
      ? compareProjectActivity(a, b, times, locale())
      : (sorter(a) > sorter(b) ? 1 : sorter(a) < sorter(b) ? -1 : 0) || String(a.id).localeCompare(String(b.id)),
  );
  const view = u.projView;
  let body;
  if (!visibleProjects().length)
    body = `<div class="panel">${empty('folder-kanban', 'No projects yet', 'Create your first project to start organizing your work.', `<button class="btn btn-primary btn-sm" data-a="newProject">${ic('plus', 14)}Create project</button>`)}</div>`;
  else if (!ps.length)
    body = `<div class="panel">${empty('search-x', 'No results found', 'No projects match your search or filters. Try a different term.', `<button class="btn btn-secondary btn-sm" data-a="clearProjFilters">Clear filters</button>`)}</div>`;
  else if (view === 'grid') body = `<div class="pgrid">${ps.map(p => projectCard(p, times.get(p.id))).join('')}</div>`;
  else if (view === 'list')
    body = `<div class="panel" style="overflow:hidden">${ps
      .map(p => {
        const pr = progressOf(p.id);
        return `<div class="mini" style="min-height:52px;gap:12px" data-a="go" data-r="project" data-id="${p.id}" data-ctx="project">${pIcon(p)}<div class="grow" style="min-width:0"><div class="row" style="gap:6px"><b style="font-weight:500">${esc(p.name)}</b>${p.private ? ic('lock', 12) : ''}</div><div class="trunc faint" style="font-size:12px">${esc(p.desc)}</div></div><span class="hide-m">${pStatus(p.status)}</span><span class="row hide-m" style="width:140px">${progBar(pr)}<span class="num faint" style="font-size:11.5px">${pr}%</span></span><span class="num muted hide-m" style="width:70px;font-size:12px">${fmtDate(p.due)}</span>${avStack(p.members, 3)}<button class="ibtn ibtn-sm" data-a="ctxBtn" data-ctx="project" data-id="${p.id}" aria-label="Options">${ic('ellipsis', 14)}</button></div>`;
      })
      .join('')}</div>`;
  else
    body = `<div class="panel" style="overflow-x:auto"><table class="perm-t" style="min-width:860px"><thead><tr><th style="padding-left:14px">Project</th><th style="text-align:left">Status</th><th style="text-align:left">Lead</th><th style="text-align:left">Team</th><th style="text-align:left;width:16%">Progress</th><th>Tasks</th><th style="text-align:left">Start</th><th style="text-align:left">Due</th><th style="text-align:left">Last activity</th><th></th></tr></thead><tbody>
    ${ps
      .map(p => {
        const ts = tasksOf(p.id);
        const pr = progressOf(p.id);
        return `<tr style="cursor:pointer" data-a="go" data-r="project" data-id="${p.id}" data-ctx="project"><td style="padding-left:14px"><span class="row">${pIcon(p, '', 14)}<span style="font-weight:500">${esc(p.name)}</span></span></td><td style="text-align:left">${pStatus(p.status)}</td><td style="text-align:left"><span class="row">${av(p.lead, 'sm')}${esc(mem(p.lead)?.name)}</span></td><td style="text-align:left" class="muted">${TM[p.team]?.name}</td><td><span class="row">${progBar(pr)}<span class="num faint" style="font-size:11.5px">${pr}%</span></span></td><td class="num">${ts.length}</td><td style="text-align:left" class="num muted">${fmtDate(p.start)}</td><td style="text-align:left" class="num muted">${fmtDate(p.due)}</td><td style="text-align:left" class="muted">${canSee(p) ? activityLabel(times.get(p.id)) : '—'}</td><td><button class="ibtn ibtn-sm" data-a="ctxBtn" data-ctx="project" data-id="${p.id}" aria-label="Options">${ic('ellipsis', 14)}</button></td></tr>`;
      })
      .join('')}
    </tbody></table></div>`;
  return `<div class="page wide">
    <div class="ph compact-page-head"><div><h1>Projects</h1><p>${visibleProjects().filter(p => p.status !== 'complete').length} active · ${visibleProjects().filter(p => p.status === 'complete').length} completed</p></div><div class="acts"><button class="btn btn-primary" data-a="newProject" aria-label="New project" title="New project">${ic('plus', 14)}<span class="hide-m">New project</span></button></div></div>
    <div class="row project-catalog-toolbar">
      <div class="inwrap">${ic('search', 13)}<input class="input search-sm" id="proj-q" data-in="projQ" placeholder="Search projects" value="${esc(u.projQ || '')}" aria-label="Search projects"></div>
      ${collectionOptions(
        `<label class="label" for="project-status-filter">Filter by status</label><select id="project-status-filter" class="select" data-in="projStatus" aria-label="Filter by status"><option value="all">All statuses</option>${Object.entries(
          PSTAT,
        )
          .map(([k, v]) => `<option value="${k}" ${st === k ? 'selected' : ''}>${v.name}</option>`)
          .join('')}</select>
      <label class="label" for="project-sort">Sort</label><select id="project-sort" class="select" data-in="projSort" aria-label="Sort">${[
        ['recent', 'Recently active'],
        ['name', 'Name'],
        ['due', 'Due date'],
        ['progress', 'Progress'],
      ]
        .map(([k, n]) => `<option value="${k}" ${sort === k ? 'selected' : ''}>${n}</option>`)
        .join('')}</select>
      <div class="seg" role="group" aria-label="Layout">${[
        ['grid', 'Grid', 'layout-grid'],
        ['list', 'List', 'list'],
        ['table', 'Table', 'table-2'],
      ]
        .map(
          ([k, n, i]) =>
            `<button aria-label="${n}" title="${n}" aria-pressed="${view === k}" class="${view === k ? 'on' : ''}" data-a="set" data-k="projView" data-v="${k}">${ic(i, 13)}<span>${n}</span></button>`,
        )
        .join('')}</div>`,
        { key: 'projects', label: 'Project filters and view', active: st !== 'all' || sort !== 'recent' || view !== 'grid' },
      )}
    </div>
    ${body}
  </div>`;
}
