/* ---------- WORKSPACE OVERVIEW ---------- */
import '../styles/portfolio.css';
import { appLocationPath } from '../shared/app-location.js';
import { TODAY, esc, fmtDate, iso, relDate } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { STATUSES } from '../core/constants.js';
import { D, S, allTasks, canSee, mem, pColor, visibleProjects } from '../core/store.js';
import { av, empty, pIcon, pStatus, progBar, stIcon } from '../ui/helpers.js';
import { pageIntroduction } from '../ui/page-introduction.js';
import { disclosureAttributes } from '../ui/disclosure.js';
import { registerRussianLabels, t } from '../core/i18n.js';
import { portfolioWork, findPortfolioRows } from '../shared/portfolio-work.js';
import { listWindow } from '../shared/list-window.js';
import { collectionView, collectionPage, saveCollectionView } from '../core/collection-view-state.js';
import { paginationHtml } from '../ui/pagination.js';
import { A, IN } from '../actions/actions.js';
import { render } from '../shell/render.js';

registerRussianLabels({
  'Milestones to review': 'Этапы к проверке',
  'Needs attention': 'Требует внимания',
  'Search projects, owners and milestones': 'Поиск проектов, ответственных и этапов',
  'Next milestone': 'Следующий этап',
  'Workspace totals': 'Итоги пространства',
  'Only projects needing attention': 'Только проекты, требующие внимания',
  'No matching projects': 'Нет подходящих проектов',
  'Try another search or show all projects.': 'Измените поиск или покажите все проекты.',
  'No open assignments': 'Нет назначенных открытых задач',
  'All members': 'Все участники',
});
IN.portfolioQuery = el => {
  S.ui.portfolioQuery = el.value;
  render();
};
A.portfolioAttention = () => {
  S.ui.portfolioAttention = S.ui.portfolioAttention === 'yes' ? '' : 'yes';
  render();
};

function projectLink(project, content, className = '') {
  return `<a class="${className}" href="${esc(appLocationPath(D(), { route: 'project', params: { id: project.id, tab: 'overview' } }))}" data-a="go" data-r="project" data-id="${esc(project.id)}" data-tab="overview" translate="no">${content}</a>`;
}
function taskCount(row, kind, count, label) {
  return `<button class="portfolio-count${kind === 'overdue' && count ? ' bad' : ''}" data-a="goTasks" data-f="${kind}" data-project="${esc(row.project.id)}" aria-label="${esc(t(label) + ': ' + count + ' · ' + row.project.name)}" title="${esc(t(label))}">${count}</button>`;
}
function nextMilestone(row, today) {
  return row.next
    ? `<small class="portfolio-next${row.next.date < today ? ' bad' : ''}"><span>${t('Next milestone')}:</span> <span translate="no">${esc(row.next.name)}</span> · ${fmtDate(row.next.date)}</small>`
    : '';
}

export function pageOverview() {
  const projects = visibleProjects().filter(canSee),
    all = allTasks(),
    today = iso(TODAY);
  const work = portfolioWork(projects, all, today);
  const view = collectionView('portfolio', { portfolioQuery: '', portfolioAttention: '' });
  const filtered = findPortfolioRows(work.rows, S.ui.portfolioQuery, S.ui.portfolioAttention === 'yes', id => mem(id)?.name);
  const pageKey = 'portfolio:' + JSON.stringify([S.ui.portfolioQuery, S.ui.portfolioAttention]);
  const window = listWindow(filtered, collectionPage(view, pageKey), 50);
  saveCollectionView(view, window.page);
  const counts = STATUSES.map(s => ({ s, n: all.filter(task => task.status === s.id).length }));
  const done = counts.find(c => c.s.id === 'done')?.n || 0;
  const load = D()
    .members.filter(m => m.status === 'active' && work.workload.has(m.id))
    .map(m => ({ m, n: work.workload.get(m.id) }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 6);
  const max = Math.max(...load.map(l => l.n), 1);
  const milestones = work.rows
    .filter(r => r.next)
    .sort((a, b) => a.next.date.localeCompare(b.next.date))
    .slice(0, 5);
  return `<div class="page overview-page layout-dashboard">
    <div class="ph compact-page-head"><div><h1>Workspace overview</h1><p class="page-description">Health of every project in ${esc(D().ws.name)}.</p></div><div class="acts">${pageIntroduction(`Health of every project in ${esc(D().ws.name)}.`)}<button class="btn btn-secondary" data-a="go" data-r="timeline" aria-label="Timeline" title="Timeline">${ic('chart-gantt', 14)}<span class="hide-m">Timeline</span></button></div></div>
    <div class="work-risk-strip" role="group" aria-label="Tasks">
      ${[
        ['overdue', work.overdue, 'Overdue'],
        ['unassigned', work.unassigned, 'Unassigned'],
        ['open', work.open, 'Open tasks'],
      ]
        .map(
          ([kind, count, label]) =>
            `<button class="btn btn-sm ${kind === 'overdue' && count ? 'btn-secondary bad' : 'btn-ghost'}" data-a="goTasks" data-f="${kind}">${t(label)} <b class="num">${count}</b></button>`,
        )
        .join('')}
      <details class="portfolio-totals" ${disclosureAttributes('portfolio-totals')}><summary>Workspace totals</summary><div class="row"><span>Projects</span> <b>${projects.length}</b> · <span>Tasks</span> <b>${all.length}</b> · <span>Completed</span> <b>${done}</b> · <span>Members</span> <b>${D().members.length}</b></div></details>
    </div>
    <section class="panel overview-portfolio">
      <div class="panel-h portfolio-heading"><h2>Portfolio</h2><span class="faint num">${filtered.length} / ${projects.length}</span><div class="portfolio-controls"><div class="inwrap">${ic('search', 14)}<input class="input search-sm" id="portfolio-search" data-in="portfolioQuery" value="${esc(S.ui.portfolioQuery)}" placeholder="Search projects, owners and milestones" aria-label="Search projects, owners and milestones"></div><button class="btn btn-sm ${S.ui.portfolioAttention === 'yes' ? 'btn-secondary on' : 'btn-ghost'}" data-a="portfolioAttention" aria-pressed="${S.ui.portfolioAttention === 'yes'}" title="Only projects needing attention">${ic('circle-alert', 14)}<span>Needs attention</span></button></div></div>
      ${
        !window.total
          ? empty('folder', 'No matching projects', 'Try another search or show all projects.')
          : `
      <div class="portfolio-cards">${window.items.map(row => `<article class="portfolio-mobile-card"><div class="row">${pIcon(row.project, '', 14)}${projectLink(row.project, esc(row.project.name), 'grow portfolio-project-name')}${pStatus(row.project.status)}</div><div class="row portfolio-owner">${av(row.project.lead, 'sm', false)}<span class="grow" translate="no">${esc(mem(row.project.lead)?.name || '—')}</span><b class="num">${row.progress}%</b></div>${nextMilestone(row, today)}<div class="portfolio-card-counts"><span>${t('Open tasks')} ${taskCount(row, 'open', row.open, 'Open tasks')}</span><span>${t('Overdue')} ${taskCount(row, 'overdue', row.overdue, 'Overdue')}</span><span>${row.project.due ? fmtDate(row.project.due) : ''}</span></div></article>`).join('')}</div>
      <div class="portfolio-table-wrap" role="region" aria-label="Portfolio" tabindex="0"><table class="perm-t overview-portfolio-table"><thead><tr><th>Project</th><th>Lead</th><th>Status</th><th>Progress</th><th>Open tasks</th><th>Overdue</th><th>Due</th></tr></thead><tbody>${window.items.map(row => `<tr><td><span class="row">${pIcon(row.project, '', 14)}${projectLink(row.project, esc(row.project.name), 'portfolio-project-name')}</span>${nextMilestone(row, today)}</td><td><span class="row portfolio-owner">${av(row.project.lead, 'sm', false)}<span translate="no">${esc(mem(row.project.lead)?.name || '—')}</span></span></td><td>${pStatus(row.project.status)}</td><td><span class="row">${progBar(row.progress)}<span class="num">${row.progress}%</span></span></td><td>${taskCount(row, 'open', row.open, 'Open tasks')}</td><td>${taskCount(row, 'overdue', row.overdue, 'Overdue')}</td><td>${row.project.due ? fmtDate(row.project.due) : '—'}</td></tr>`).join('')}</tbody></table></div>`
      }
      ${paginationHtml(window, pageKey)}
    </section>
    <div class="portfolio-support">
      <section class="panel"><div class="panel-h"><h2>Tasks by status</h2></div><div class="panel-b">${counts.map(c => `<div class="row portfolio-status-row">${stIcon(c.s.id)}<span class="grow">${c.s.name}</span><span class="num muted">${c.n}</span></div>`).join('')}</div></section>
      <section class="panel"><div class="panel-h"><h2>Workload</h2><div class="acts"><button class="btn btn-sm btn-ghost" data-a="go" data-r="members">All members</button></div></div><div class="panel-b">${load.map(l => `<button class="portfolio-workload" data-a="goTasks" data-f="open" data-assignee="${esc(l.m.id)}" title="${esc(t('Open tasks') + ': ' + l.m.name)}">${av(l.m.id, 'sm', false)}<span class="trunc" translate="no">${esc(l.m.name)}</span><i style="--work:${(l.n / max) * 100}%"></i><b class="num">${l.n}</b></button>`).join('') || '<p class="faint">No open assignments</p>'}</div></section>
      ${milestones.length ? `<section class="panel"><div class="panel-h"><h2>Milestones to review</h2></div><div class="panel-b">${milestones.map(row => `<button class="portfolio-milestone" data-a="go" data-r="project" data-id="${esc(row.project.id)}" data-tab="timeline"><span class="pdot" style="--c:${pColor(row.project)}"></span><span class="grow"><b translate="no">${esc(row.next.name)}</b><small translate="no">${esc(row.project.name)}</small></span><span class="num${row.next.date < today ? ' bad' : ''}">${relDate(row.next.date)}</span></button>`).join('')}</div></section>` : ''}
    </div>
  </div>`;
}
