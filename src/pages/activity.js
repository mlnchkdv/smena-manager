import { activityMatcher, activityRangeValid } from '../shared/activity-view.js';
import { calendarDate } from '../shared/calendar-time.js';
import { isRussian } from '../core/i18n.js';
const T = (en, ru) => (isRussian() ? ru : en);
/* ---------- ACTIVITY ---------- */
import { collectionView, collectionPage, saveCollectionView, resetCollectionView } from '../core/collection-view-state.js';
import { dayBucket, esc } from '../core/utils.js';
import { D, S, canSee, proj } from '../core/store.js';
import { empty } from '../ui/helpers.js';
import { actHtml } from '../components/task-list.js';
import { segmentedControl } from '../ui/segmented-control.js';
import { A, IN } from '../actions/actions.js';
import { render } from '../shell/render.js';
import { listWindow } from '../shared/list-window.js';
import { paginationHtml } from '../ui/pagination.js';
import { disclosureAttributes } from '../ui/disclosure.js';
for (const key of ['actFrom', 'actTo'])
  IN[key] = el => {
    S.ui[key] = /^\d{4}-\d{2}-\d{2}$/.test(el.value) ? el.value : '';
    render();
  };
A.resetActivityDates = () => {
  S.ui.actFrom = '';
  S.ui.actTo = '';
  render();
};
IN.actQuery = el => {
  S.ui.actQuery = el.value.slice(0, 500);
  render();
};
IN.actProject = el => {
  S.ui.actProject = el.value;
  render();
};
A.activityPeriod = el => {
  const today = calendarDate(new Date(), S.prefs.tz),
    start = new Date(today + 'T00:00:00Z');
  start.setUTCDate(start.getUTCDate() - Math.max(0, Number(el.dataset.days) - 1));
  S.ui.actFrom = start.toISOString().slice(0, 10);
  S.ui.actTo = today;
  render();
};
const activityDefaults = { actFilter: 'all', actWho: 'all', actFrom: '', actTo: '', actQuery: '', actProject: 'all' };
A.resetActivityFilters = () => {
  resetCollectionView(collectionView('activity', activityDefaults));
  render();
};

export function pageActivity() {
  const viewState = collectionView('activity', activityDefaults);
  const f = S.ui.actFilter || 'all';
  const who = S.ui.actWho || 'all';
  const tasks = new Map((D().tasks || []).map(t => [t.id, t]));
  const available = D().activity.filter(a => {
    const id = a.project || tasks.get(a.task)?.project;
    return !id || canSee(proj(id));
  });
  const query = S.ui.actQuery || '',
    project = S.ui.actProject || 'all';
  let as = available;
  if (f !== 'all')
    as = as.filter(a =>
      f === 'comments'
        ? a.verb.includes('comment')
        : f === 'status'
          ? /moved|completed|reopened/.test(a.verb)
          : f === 'projects'
            ? a.verb.includes('project')
            : true,
    );
  if (who !== 'all') as = as.filter(a => a.by === who);
  const from = S.ui.actFrom || '',
    to = S.ui.actTo || '';
  const invalidRange = !activityRangeValid(from, to);
  const dateError = invalidRange ? 'aria-invalid="true" aria-describedby="activity-date-error"' : '';
  as = as.filter(activityMatcher(D(), { query, project, from, to, zone: S.prefs.tz })).sort((a, b) => Number(new Date(b.at)) - Number(new Date(a.at)));
  const key = JSON.stringify(['activity', D().ws.id || D().ws.url, D().me, f, who, from, to, query, project]);
  const page = listWindow(as, collectionPage(viewState, key), 50);
  saveCollectionView(viewState, page.page);
  const b = {};
  page.items.forEach(a => (b[dayBucket(a.at)] ||= []).push(a));
  return `<div class="page activity-page layout-reading">
    <div class="ph"><div><h1>Activity</h1><p>Everything that's changed across the workspace.</p></div></div>
    <div class="row" style="gap:8px;margin-bottom:6px;flex-wrap:wrap">${segmentedControl({
      label: 'Activity filters',
      key: 'actFilter',
      value: f,
      items: [
        ['all', 'All'],
        ['status', 'Status changes'],
        ['comments', 'Comments'],
        ['projects', 'Projects'],
      ],
    })}
    <input class="input" data-in="actQuery" aria-label="${T('Search activity', 'Поиск по активности')}" placeholder="${T('Object or project', 'Объект или проект')}" value="${esc(query)}"><select class="select" data-in="actProject" aria-label="${T('Project', 'Проект')}"><option value="all">${T('All projects', 'Все проекты')}</option>${D()
      .projects.filter(canSee)
      .map(p => `<option value="${esc(p.id)}" ${project === p.id ? 'selected' : ''} translate="no">${esc(p.name)}</option>`)
      .join(
        '',
      )}</select><select class="select" style="height:26px;width:auto;font-size:12px" data-in="actWho" aria-label="Filter by person"><option value="all">Everyone</option>${D()
      .members.map(m => `<option value="${m.id}" ${who === m.id ? 'selected' : ''}>${esc(m.name)}</option>`)
      .join(
        '',
      )}</select></div><details class="activity-date-options" ${disclosureAttributes('activity-period')}><summary>${T('Period', 'Период')}${from || to ? ' · ' + esc(from || '…') + ' → ' + esc(to || '…') : ''}</summary><div class="row" style="flex-wrap:wrap;gap:8px"><button class="btn btn-secondary btn-sm" id="activity-period-today" data-a="activityPeriod" data-days="1">${T('Today', 'Сегодня')}</button><button class="btn btn-secondary btn-sm" id="activity-period-week" data-a="activityPeriod" data-days="7">${T('Last 7 days', 'Последние 7 дней')}</button><label class="field"><span>From date</span><input id="activity-from" type="date" class="input" data-in="actFrom" ${dateError} value="${esc(from)}" max="${esc(to)}"></label><label class="field"><span>To date</span><input id="activity-to" type="date" class="input" data-in="actTo" ${dateError} value="${esc(to)}" min="${esc(from)}"></label><button class="btn btn-ghost btn-sm" data-a="resetActivityDates">Clear dates</button></div></details><button class="btn btn-ghost btn-sm" data-a="resetActivityFilters">Reset view</button>${invalidRange ? '' : `<p class="hint" role="status"><span>Results</span>: ${page.total}</p>`}
    ${
      invalidRange
        ? `<p id="activity-date-error" class="alert warn" role="alert" translate="no">${T('The start date must be on or before the end date. Correct the dates or clear the period.', 'Начальная дата должна быть не позже конечной. Исправьте даты или очистите период.')}</p>`
        : as.length
          ? Object.entries(b)
              .map(([k, list]) => `<div class="day-h">${k}</div><div class="feed lined">${list.map(a => actHtml(a, { proj: true })).join('')}</div>`)
              .join('')
          : available.length && (f !== 'all' || who !== 'all' || from || to || query || project !== 'all')
            ? empty(
                'search',
                'No matching activity.',
                'Change the filters or clear them to see more events.',
                '<button class="btn btn-secondary" data-a="resetActivityFilters">Clear filters</button>',
              )
            : empty('activity', 'No activity yet', 'Changes to tasks and projects will appear here.')
    }${paginationHtml(page, key)}
  </div>`;
}
