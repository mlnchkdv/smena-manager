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
const activityDefaults = { actFilter: 'all', actWho: 'all', actFrom: '', actTo: '' };
A.resetActivityFilters = () => {
  resetCollectionView(collectionView('activity', activityDefaults));
  render();
};

export function pageActivity() {
  const viewState = collectionView('activity', activityDefaults);
  const f = S.ui.actFilter || 'all';
  const who = S.ui.actWho || 'all';
  const available = D().activity.filter(a => !a.project || canSee(proj(a.project)));
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
  const start = from ? new Date(from + 'T00:00:00').getTime() : -Infinity;
  const end = to ? new Date(to + 'T23:59:59.999').getTime() : Infinity;
  as = as.filter(a => Number(new Date(a.at)) >= start && Number(new Date(a.at)) <= end).sort((a, b) => Number(new Date(b.at)) - Number(new Date(a.at)));
  const key = JSON.stringify(['activity', D().ws.id || D().ws.url, D().me, f, who, from, to]);
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
    <select class="select" style="height:26px;width:auto;font-size:12px" data-in="actWho" aria-label="Filter by person"><option value="all">Everyone</option>${D()
      .members.map(m => `<option value="${m.id}" ${who === m.id ? 'selected' : ''}>${esc(m.name)}</option>`)
      .join(
        '',
      )}</select></div><div class="row" style="flex-wrap:wrap;gap:8px;margin-bottom:12px"><label class="field"><span>From date</span><input type="date" class="input" data-in="actFrom" value="${esc(from)}" max="${esc(to)}"></label><label class="field"><span>To date</span><input type="date" class="input" data-in="actTo" value="${esc(to)}" min="${esc(from)}"></label>${from || to ? '<button class="btn btn-ghost btn-sm" data-a="resetActivityDates">Clear dates</button>' : ''}</div><button class="btn btn-ghost btn-sm" data-a="resetActivityFilters">Reset view</button><p class="hint" role="status"><span>Results</span>: ${page.total}</p>
    ${
      as.length
        ? Object.entries(b)
            .map(([k, list]) => `<div class="day-h">${k}</div><div class="feed lined">${list.map(a => actHtml(a, { proj: true })).join('')}</div>`)
            .join('')
        : available.length && (f !== 'all' || who !== 'all' || from || to)
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
