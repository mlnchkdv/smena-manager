/* ---------- MY TASKS ---------- */
import { TODAY, dOff, diffD, parse } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { D, S, allTasks, isOver } from '../core/store.js';
import { applyView, viewOf, viewToolbar } from '../shell/view-engine.js';
import { listHtml } from '../components/task-list.js';
import { calendarHtml } from '../views/calendar.js';
import { empty } from '../ui/helpers.js';

export function pageMyTasks() {
  const key = 'mytasks';
  const v = viewOf(key);
  const assigned = allTasks().filter(t => t.assignee === D().me);
  const mine = applyView(assigned, v.sort.f === 'manual' ? { ...v, sort: { f: 'due', dir: 1 } } : v);
  const groups = [
    { key: 'overdue', name: 'Overdue', html: `<span style="color:var(--red)">${ic('clock-alert', 14)}</span>`, tasks: mine.filter(isOver), set: {} },
    {
      key: 'today',
      name: 'Today',
      html: ic('sun', 14),
      tasks: mine.filter(t => t.status !== 'done' && t.due && diffD(parse(t.due), TODAY) === 0),
      set: { due: dOff(0) },
    },
    {
      key: 'upcoming',
      name: 'Upcoming',
      html: ic('calendar-days', 14),
      tasks: mine.filter(t => t.status !== 'done' && (!t.due || diffD(parse(t.due), TODAY) > 0)),
      set: { due: dOff(3) },
    },
    {
      key: 'completed',
      name: 'Completed',
      html: `<span style="color:var(--green)">${ic('circle-check', 14)}</span>`,
      tasks: mine.filter(t => t.status === 'done'),
      set: { status: 'done' },
      collapsed: true,
    },
  ];
  const mode = S.ui.myView;
  const views = `<div class="seg" role="group" aria-label="Task view">${[
    ['list', 'List', 'list'],
    ['calendar', 'Calendar', 'calendar'],
  ]
    .map(
      ([k, n, i]) =>
        `<button class="${mode === k ? 'on' : ''}" data-a="set" data-k="myView" data-v="${k}" aria-label="${n}" title="${n}" aria-pressed="${mode === k}">${ic(i, 13)}<span class="hide-m">${n}</span></button>`,
    )
    .join('')}</div>`;
  return `<div class="page flush mytasks-page">
    <div class="ph"><div><h1>My Tasks</h1><p>${groups[1].tasks.length} due today · ${groups[0].tasks.length} overdue · ${groups[2].tasks.length} upcoming</p></div>
      <div class="acts"><button class="btn btn-primary" data-a="newTask" data-assignee="${D().me}" aria-label="New task">${ic('plus', 14)}<span class="hide-m">New task</span></button><div class="task-mobile-view">${views}</div></div></div>
    ${viewToolbar(key, { group: false, compact: true, right: `<div class="task-wide-view">${views}</div>` })}
    ${mode === 'calendar' ? calendarHtml(mine, { key: 'my' }) : !mine.length ? `<div class="personal-work-empty">${empty('list-checks', assigned.length ? 'No results found' : 'No tasks assigned to you yet', assigned.length ? 'Change the search or filters.' : '', '<button class="btn btn-secondary" data-a="go" data-r="tasks">Browse workspace tasks</button>', 'sm')}</div>` : `<div class="list-wrap">${listHtml(groups, key, { cols: ['project', 'status', 'priority', 'due'], complete: true, drag: false, keepEmpty: true })}</div>`}
  </div>`;
}
