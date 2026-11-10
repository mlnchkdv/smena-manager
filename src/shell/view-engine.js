/* ---------- filter engine ---------- */
import { DAY, TODAY, diffD, esc, parse } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { LABELS, PR, PRIOS, STATUSES } from '../core/constants.js';
import { D, S, canSee, isOver, mem, pColor, proj, visibleProjects } from '../core/store.js';
import { av, prIcon, stIcon } from '../ui/helpers.js';
import { disclosureAttributes } from '../ui/disclosure.js';
import { registerRussianLabels, t as tr } from '../core/i18n.js';
import { completedWithin } from '../shared/work-list-intent.js';
import { matchesTaskCycle, taskCycleValue } from '../shared/task-cycles.js';

registerRussianLabels({ 'Completed date': 'Дата завершения' });

const cycleFilterProject = key => proj(key?.startsWith('p:') ? key.slice(2) : D().savedViews.find(view => key === 'sv:' + view.id)?.project);

export const FIELDS = {
  status: { name: 'Status', icon: 'circle-dot', opts: () => STATUSES.map(s => ({ id: s.id, name: s.name, html: stIcon(s.id) })) },
  assignee: {
    name: 'Assignee',
    icon: 'user',
    opts: () => [
      { id: 'none', name: 'Unassigned', html: av(null, 'sm', false) },
      ...D().members.map(m => ({ id: m.id, name: m.name + (m.id === D().me ? ` ${tr('(you)')}` : ''), html: av(m.id, 'sm', false) })),
    ],
  },
  priority: { name: 'Priority', icon: 'signal-high', opts: () => PRIOS.map(p => ({ id: p.id, name: p.name, html: prIcon(p.id) })) },
  due: {
    name: 'Due date',
    icon: 'calendar',
    opts: () => [
      { id: 'overdue', name: 'Overdue' },
      { id: 'today', name: 'Today' },
      { id: 'week', name: 'Next 7 days' },
      { id: 'later', name: 'Later' },
      { id: 'nodate', name: 'No due date' },
    ],
  },
  project: {
    name: 'Project',
    icon: 'folder',
    opts: () =>
      visibleProjects()
        .filter(canSee)
        .map(p => ({ id: p.id, name: p.name, html: `<span class="pdot" style="--c:${pColor(p)}"></span>` })),
  },
  labels: { name: 'Labels', icon: 'tag', opts: () => LABELS.map(l => ({ id: l.id, name: l.name, html: `<span class="pdot" style="--c:${l.c}"></span>` })) },
  created: {
    name: 'Created date',
    icon: 'calendar-plus',
    opts: () => [
      { id: '1', name: 'Last 24 hours' },
      { id: '7', name: 'Last 7 days' },
      { id: '30', name: 'Last 30 days' },
    ],
  },
  updated: {
    name: 'Updated date',
    icon: 'history',
    opts: () => [
      { id: '1', name: 'Last 24 hours' },
      { id: '7', name: 'Last 7 days' },
      { id: '30', name: 'Last 30 days' },
    ],
  },
};
FIELDS.completed = { ...FIELDS.updated, name: 'Completed date', icon: 'circle-check' };
FIELDS.cycleId = {
  name: 'Cycle',
  icon: 'repeat',
  dynamic: true,
  visible: key => !!cycleFilterProject(key)?.workflow?.cycles?.length,
  opts: key => {
    const project = cycleFilterProject(key);
    return project
      ? [
          { id: taskCycleValue(project.id), name: tr('No cycle') },
          ...(project.workflow?.cycles || []).map(cycle => ({
            id: taskCycleValue(project.id, cycle.id),
            name: cycle.name + (cycle.archived ? ' · ' + tr('Archived') : ''),
          })),
        ]
      : [];
  },
};
export const filterFields = key => Object.entries(FIELDS).filter(([, field]) => !field.visible || field.visible(key));
export function viewOf(key) {
  if (!S.views[key])
    S.views[key] = {
      filters: [],
      sort: { f: 'manual', dir: 1 },
      group: key === 'tasks' || key === 'mytasks' ? 'status' : 'status',
      q: '',
      hidden: ['start', 'created', 'deps'],
      colW: {},
      showDone: true,
    };
  return S.views[key];
}
export function matchF(t, f) {
  if (!f.v || !f.v.length) return true;
  let hit;
  if (f.f === 'labels') hit = f.v.some(v => t.labels.includes(v));
  else if (f.f === 'cycleId') hit = matchesTaskCycle(t, f.v);
  else if (f.f === 'assignee') hit = f.v.includes(t.assignee || 'none');
  else if (f.f === 'due') {
    hit = f.v.some(v => {
      if (v === 'nodate') return !t.due;
      if (!t.due) return false;
      const n = diffD(parse(t.due), TODAY);
      return v === 'overdue' ? isOver(t) : v === 'today' ? n === 0 : v === 'week' ? n >= 0 && n <= 7 : n > 7;
    });
  } else if (f.f === 'completed') hit = f.v.some(v => completedWithin(t, v));
  else if (f.f === 'created' || f.f === 'updated') {
    const ts = f.f === 'created' ? t.created : t.updated;
    hit = f.v.some(v => Date.now() - ts <= +v * DAY);
  } else hit = f.v.includes(t[f.f]);
  return f.op === 'not' ? !hit : hit;
}
export function applyView(ts, v) {
  let out = ts.filter(t => v.filters.every(f => matchF(t, f)));
  if (v.q) {
    const q = v.q.toLowerCase();
    out = out.filter(t => t.title.toLowerCase().includes(q) || t.key.toLowerCase().includes(q));
  }
  return sortTasks(out, v.sort);
}
export function sortTasks(ts, s) {
  const d = s.dir || 1;
  const a = [...ts];
  const key =
    {
      manual: t => t.order,
      title: t => t.title.toLowerCase(),
      due: t => t.due || '9999',
      start: t => t.start || '9999',
      priority: t => -PR[t.priority || 'none'].w,
      status: t => STATUSES.findIndex(x => x.id === t.status),
      assignee: t => mem(t.assignee)?.name || 'zzz',
      created: t => -t.created,
      updated: t => -t.updated,
      estimate: t => t.estimate || 'zzz',
      project: t => proj(t.project)?.name,
    }[s.f] || (t => t.order);
  return a.sort((x, y) => {
    const p = key(x),
      q = key(y);
    return (p > q ? 1 : p < q ? -1 : 0) * d;
  });
}
export function groupTasks(ts, g) {
  if (g === 'none') return [{ key: 'all', name: 'All tasks', html: '', tasks: ts }];
  let groups;
  if (g === 'status') groups = STATUSES.map(s => ({ key: s.id, name: s.name, html: stIcon(s.id), set: { status: s.id } }));
  else if (g === 'priority') groups = PRIOS.map(p => ({ key: p.id, name: p.name, html: prIcon(p.id), set: { priority: p.id } }));
  else if (g === 'assignee')
    groups = [
      ...D().members.map(m => ({ key: m.id, name: m.name, html: av(m.id, 'sm', false), set: { assignee: m.id } })),
      { key: 'none', name: 'Unassigned', html: av(null, 'sm', false), set: { assignee: null } },
    ];
  else if (g === 'project')
    groups = visibleProjects()
      .filter(canSee)
      .map(p => ({ key: p.id, name: p.name, html: `<span class="pdot" style="--c:${pColor(p)}"></span>`, set: { project: p.id } }));
  else if (g === 'due')
    groups = [
      { key: 'overdue', name: 'Overdue' },
      { key: 'today', name: 'Today' },
      { key: 'week', name: 'Next 7 days' },
      { key: 'later', name: 'Later' },
      { key: 'nodate', name: 'No due date' },
    ].map(x => ({ ...x, html: ic('calendar', 14) }));
  groups.forEach(G => {
    G.tasks = ts.filter(t => {
      if (g === 'assignee') return (t.assignee || 'none') === G.key;
      if (g === 'due') return matchF(t, { f: 'due', op: 'is', v: [G.key] });
      return t[g] === G.key;
    });
  });
  return g === 'status' || g === 'priority' ? groups : groups.filter(G => G.tasks.length);
}
export function filterChips(key) {
  const v = viewOf(key);
  if (!v.filters.length) return '';
  const chips = v.filters
    .map((f, i) => {
      const F = FIELDS[f.f];
      const opts = F?.opts?.(key) || [];
      const names = f.v.map(id => {
        const name = opts.find(o => o.id === id)?.name || id;
        return ['assignee', 'project', 'cycleId'].includes(f.f) ? name : tr(name);
      });
      const val = names.length ? (names.length > 2 ? tr(`${names.length} selected`) : names.join(', ')) : tr('any');
      const label = `${tr(F?.name || 'Filter')} ${tr(f.op === 'not' ? 'is not' : 'is')} ${val}`;
      return `${i ? `<span>${tr('and')}</span>` : ''}<span class="chip"><button class="filter-chip-main" data-a="pop" data-pop="fvals" data-key="${key}" data-i="${i}" aria-label="${esc(label)}" title="${esc(label)}">${ic(F?.icon || 'filter', 12)}<b>${esc(tr(F?.name || 'Filter'))}</b> <span class="filter-chip-op">${tr(f.op === 'not' ? 'is not' : 'is')}</span> <span class="filter-chip-value" ${F?.dynamic ? 'translate="no"' : ''}>${esc(val)}</span></button><button class="ibtn" data-a="rmFilter" data-key="${key}" data-i="${i}" aria-label="Remove filter">${ic('x', 12)}</button></span>`;
    })
    .join('');
  return `<div class="chipsbar">${ic('list-filter', 13)}${chips}<button class="btn btn-sm btn-ghost" data-a="pop" data-pop="filter" data-key="${key}">${ic('plus', 12)}Add</button><span class="sp"></span><button class="btn btn-sm btn-ghost" data-a="clearFilters" data-key="${key}">Clear all</button></div>`;
}
export function viewToolbar(key, opt = {}) {
  const v = viewOf(key);
  const sortName = {
    manual: 'Manual',
    title: 'Title',
    due: 'Due date',
    priority: 'Priority',
    status: 'Status',
    created: 'Created',
    updated: 'Updated',
    assignee: 'Assignee',
    start: 'Start date',
    estimate: 'Estimate',
    project: 'Project',
  }[v.sort.f];
  const compact = opt.compact && (document.querySelector('.main')?.clientWidth || innerWidth) <= 640;
  const secondary = `${opt.sort === false ? '' : `<button class="btn btn-ghost" data-a="pop" data-pop="sort" data-key="${key}">${ic('arrow-up-down', 14)}<span class="hide-m">Sort:</span> ${sortName}</button>`}
    ${opt.group !== false ? `<button class="btn btn-ghost" data-a="pop" data-pop="group" data-key="${key}">${ic('rows-3', 14)}<span class="hide-m">Group:</span> ${{ status: 'Status', priority: 'Priority', assignee: 'Assignee', project: 'Project', due: 'Due date', none: 'None' }[v.group]}</button>` : ''}
    ${opt.cols ? `<button class="btn btn-ghost" data-a="pop" data-pop="cols" data-key="${key}">${ic('columns-3', 14)}Columns</button>` : ''}`;
  return `<div class="toolbar ${compact ? 'task-controls-toolbar' : ''}" role="toolbar">
    <div class="inwrap">${ic('search', 13)}<input class="input search-sm" id="vq-${key}" data-in="viewQ" data-key="${key}" placeholder="Search tasks" value="${esc(v.q)}" aria-label="Search tasks"></div>
    <button class="btn btn-ghost ${v.filters.length ? 'on' : ''}" data-a="pop" data-pop="filter" data-key="${key}">${ic('list-filter', 14)}Filter${v.filters.length ? ` <span class="badge accent" style="height:16px;padding:0 5px">${v.filters.length}</span>` : ''}</button>
    ${compact ? `<details class="ui-menu task-view-options" ${disclosureAttributes(`task-controls:${key}`)}><summary class="btn btn-secondary" aria-label="View options" title="View options">${ic('settings-2', 15)}</summary><div>${secondary}</div></details>` : secondary}
    ${opt.extra || ''}
    <span class="sp"></span>
    ${opt.right || ''}
  </div>${filterChips(key)}`;
}
