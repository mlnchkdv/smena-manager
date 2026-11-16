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
  'Projects, workload and upcoming milestones.': 'Проекты, загрузка и ближайшие этапы.',
  'Unnamed milestone': 'Этап без названия',
  'No projects in this scope': 'В этой области пока нет проектов',
  'No tasks yet': 'Пока нет задач',
  'Project scope': 'Область обзора',
  'Open tasks by member': 'Открытые задачи по участникам',
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
  'Overdue tasks': 'Просроченные задачи',
  'Without assignee': 'Без исполнителя',
  'Project deadline overdue': 'Срок проекта просрочен',
  'Projects with overdue tasks or deadlines, unassigned tasks, overdue milestones or At risk status.':
    'Проекты с просроченными задачами, сроком проекта или этапа, задачами без исполнителя либо статусом «Под угрозой».',
});
IN.portfolioQuery = el => {
  S.ui.portfolioQuery = el.value;
  render();
};
A.portfolioAttention = () => {
  S.ui.portfolioAttention = S.ui.portfolioAttention === 'yes' ? '' : 'yes';
  render();
};

A.resetPortfolioFilters = () => {
  S.ui.portfolioQuery = '';
  S.ui.portfolioAttention = '';
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
    ? `<small class="portfolio-next${row.next.date < today ? ' bad' : ''}"><span>${t('Next milestone')}:</span> <span translate="no">${esc(row.next.name || t('Unnamed milestone'))}</span> · ${fmtDate(row.next.date)}</small>`
    : '';
}
function projectSignals(row, today) {
  const reasons = [];
  if (row.project.status !== 'complete' && row.project.due && row.project.due < today)
    reasons.push(`<span class="bad">${t('Project deadline overdue')}</span>`);
  if (row.unassigned) reasons.push(`<span>${t('Without assignee')}: ${taskCount(row, 'unassigned', row.unassigned, 'Without assignee')}</span>`);
  return reasons.length ? `<div class="portfolio-signals">${reasons.join('')}</div>` : '';
}

IN.portfolioScope = el => {
  S.ui.portfolioScope = ['all', 'active', 'complete'].includes(el.value) ? el.value : 'active';
  render();
};
export function pageOverview() {
  const view = collectionView('portfolio', { portfolioQuery: '', portfolioAttention: '', portfolioScope: 'active' });
  const projects = visibleProjects()
      .filter(canSee)
      .filter(p => S.ui.portfolioScope === 'all' || (S.ui.portfolioScope === 'complete' ? p.status === 'complete' : p.status !== 'complete')),
    projectIds = new Set(projects.map(p => p.id)),
    all = allTasks().filter(task => projectIds.has(task.project)),
    today = iso(TODAY);
  const work = portfolioWork(projects, all, today);
  const filtered = findPortfolioRows(work.rows, S.ui.portfolioQuery, S.ui.portfolioAttention === 'yes', id => mem(id)?.name);
  const pageKey = 'portfolio:' + JSON.stringify([S.ui.portfolioScope, S.ui.portfolioQuery, S.ui.portfolioAttention]);
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
    <div class="ph compact-page-head"><div><h1>Team overview</h1><p class="page-description">Projects, workload and upcoming milestones.</p></div><div class="acts"><label class="overview-scope"><span class="sr">Project scope</span><select class="select" data-in="portfolioScope" aria-label="Project scope">${[
      ['active', 'Active projects'],
      ['all', 'All projects'],
      ['complete', 'Completed projects'],
    ]
      .map(([key, label]) => `<option value="${key}" ${S.ui.portfolioScope === key ? 'selected' : ''}>${t(label)}</option>`)
      .join(
        '',
      )}</select></label>${pageIntroduction(`Projects, workload and upcoming milestones.`)}<button class="btn btn-secondary" data-a="go" data-r="timeline" aria-label="Timeline" title="Timeline">${ic('chart-gantt', 14)}<span class="hide-m">Timeline</span></button></div></div>
    <div class="work-risk-strip" role="group" aria-label="Tasks">
      ${[
        ['overdue', work.overdue, 'Overdue tasks'],
        ['unassigned', work.unassigned, 'Without assignee'],
        ['open', work.open, 'Open tasks'],
      ]
        .map(
          ([kind, count, label]) =>
            `<button class="btn btn-sm ${kind === 'overdue' && count ? 'btn-secondary bad' : 'btn-ghost'}" data-a="goTasks" data-projects="${projects.map(p => p.id).join(',')}" data-f="${kind}">${t(label)} <b class="num">${count}</b></button>`,
        )
        .join('')}
      <details class="portfolio-totals" ${disclosureAttributes('portfolio-totals')}><summary>Workspace totals</summary><div class="row"><span>Projects</span> <b>${projects.length}</b> · <span>Tasks</span> <b>${all.length}</b> · <span>Completed</span> <b>${done}</b> · <span>Members</span> <b>${D().members.filter(m => m.status === 'active').length}</b></div></details>
    </div>
    <section class="panel overview-portfolio">
      <div class="panel-h portfolio-heading"><h2>Portfolio</h2><span class="faint num">${filtered.length} / ${projects.length}</span><div class="portfolio-controls"><div class="inwrap">${ic('search', 14)}<input class="input search-sm" id="portfolio-search" data-in="portfolioQuery" value="${esc(S.ui.portfolioQuery)}" placeholder="Search projects" aria-label="Search projects, owners and milestones"></div><button class="btn btn-sm ${S.ui.portfolioAttention === 'yes' ? 'btn-secondary on' : 'btn-ghost'}" data-a="portfolioAttention" aria-pressed="${S.ui.portfolioAttention === 'yes'}" aria-describedby="portfolio-attention-help" title="Projects with overdue tasks or deadlines, unassigned tasks, overdue milestones or At risk status.">${ic('circle-alert', 14)}<span>Needs attention</span></button>${S.ui.portfolioQuery || S.ui.portfolioAttention ? '<button class="btn btn-ghost btn-sm" data-a="resetPortfolioFilters">Clear filters</button>' : ''}</div></div>
      <p class="sr" id="portfolio-attention-help">Projects with overdue tasks or deadlines, unassigned tasks, overdue milestones or At risk status.</p>
      ${
        !window.total
          ? empty(
              'folder',
              projects.length ? 'No matching projects' : 'No projects in this scope',
              'Try another search or show all projects.',
              '<button class="btn btn-secondary" data-a="go" data-r="projects">All projects</button>',
            )
          : `
      <div class="portfolio-cards">${window.items.map(row => `<article class="portfolio-mobile-card"><div class="row">${pIcon(row.project, '', 14)}${projectLink(row.project, esc(row.project.name), 'grow portfolio-project-name')}${pStatus(row.project.status)}</div><div class="row portfolio-owner">${av(row.project.lead, 'sm', false)}<span class="grow" translate="no">${esc(mem(row.project.lead)?.name || '—')}</span><b class="num" title="${row.total ? t('Progress') : t('No tasks yet')}">${row.total ? row.progress + '%' : '—'}</b></div>${nextMilestone(row, today)}${projectSignals(row, today)}<div class="portfolio-card-counts"><span>${t('Open tasks')} ${taskCount(row, 'open', row.open, 'Open tasks')}</span><span>${t('Overdue tasks')} ${taskCount(row, 'overdue', row.overdue, 'Overdue tasks')}</span><span>${row.project.due ? `${ic('calendar', 12)}<span class="sr">${t('Due')}: </span>${fmtDate(row.project.due)}` : ''}</span></div></article>`).join('')}</div>
      <div class="portfolio-table-wrap" role="region" aria-label="Portfolio" tabindex="0"><table class="perm-t overview-portfolio-table"><thead><tr><th>Project</th><th>Lead</th><th>Status</th><th>Progress</th><th>Open tasks</th><th>${t('Overdue tasks')}</th><th>Due</th></tr></thead><tbody>${window.items.map(row => `<tr><td><span class="row">${pIcon(row.project, '', 14)}${projectLink(row.project, esc(row.project.name), 'portfolio-project-name')}</span>${nextMilestone(row, today)}${projectSignals(row, today)}</td><td><span class="row portfolio-owner">${av(row.project.lead, 'sm', false)}<span translate="no">${esc(mem(row.project.lead)?.name || '—')}</span></span></td><td>${pStatus(row.project.status)}</td><td><span class="row">${row.total ? `${progBar(row.progress)}<span class="num">${row.progress}%</span>` : `<span class="hint">${t('No tasks yet')}</span>`}</span></td><td>${taskCount(row, 'open', row.open, 'Open tasks')}</td><td>${taskCount(row, 'overdue', row.overdue, 'Overdue tasks')}</td><td>${row.project.due ? fmtDate(row.project.due) : '—'}</td></tr>`).join('')}</tbody></table></div>`
      }
      ${paginationHtml(window, pageKey)}
    </section>
    <div class="portfolio-support">
      <section class="panel"><div class="panel-h"><h2>Tasks by status</h2></div><div class="panel-b">${counts.map(c => `<button class="row portfolio-status-row" data-a="goTasks" data-projects="${projects.map(p => p.id).join(',')}" data-status="${c.s.id}" aria-label="${t(c.s.name)}: ${c.n}">${stIcon(c.s.id)}<span class="grow">${c.s.name}</span><span class="num muted">${c.n}</span></button>`).join('')}</div></section>
      <section class="panel"><div class="panel-h"><h2>Open tasks by member</h2><div class="acts"><button class="btn btn-sm btn-ghost" data-a="go" data-r="members">All members</button></div></div><div class="panel-b">${load.map(l => `<button class="portfolio-workload" data-a="goTasks" data-projects="${projects.map(p => p.id).join(',')}" data-f="open" data-assignee="${esc(l.m.id)}" title="${esc(t('Open tasks') + ': ' + l.m.name)}">${av(l.m.id, 'sm', false)}<span class="trunc" translate="no">${esc(l.m.name)}</span><i style="--work:${(l.n / max) * 100}%"></i><b class="num">${l.n}</b></button>`).join('') || '<p class="faint">No open assignments</p>'}</div></section>
      ${milestones.length ? `<section class="panel"><div class="panel-h"><h2>Milestones to review</h2></div><div class="panel-b">${milestones.map(row => `<button class="portfolio-milestone" data-a="go" data-r="project" data-id="${esc(row.project.id)}" data-tab="timeline"><span class="pdot" style="--c:${pColor(row.project)}"></span><span class="grow"><b translate="no">${esc(row.next.name || t('Unnamed milestone'))}</b><small translate="no">${esc(row.project.name)}</small></span><span class="num${row.next.date < today ? ' bad' : ''}">${relDate(row.next.date)}</span></button>`).join('')}</div></section>` : ''}
    </div>
  </div>`;
}
