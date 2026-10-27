/* ---------- WORKSPACE TASKS ---------- */
import { ic } from '../core/icons.js';
import { allTasks, canSee, visibleProjects } from '../core/store.js';
import { applyView, groupTasks, viewOf, viewToolbar } from '../shell/view-engine.js';
import { listHtml } from '../components/task-list.js';
import { boardHtml } from '../views/board.js';
import { tableHtml } from '../views/table.js';

export function pageTasks() {
  const key = 'tasks';
  const v = viewOf(key);
  v.mode = v.mode || 'list';
  const ts = applyView(allTasks(), v);
  const right = `<div class="seg" role="group" aria-label="Task view">${[
    ['list', 'List', 'list'],
    ['board', 'Board', 'square-kanban'],
    ['table', 'Table', 'table-2'],
  ]
    .map(
      ([k, n, i]) =>
        `<button class="${v.mode === k ? 'on' : ''}" data-a="setViewMode" data-key="${key}" data-v="${k}" aria-label="${n}" title="${n}" aria-pressed="${v.mode === k}">${ic(i, 13)}<span class="hide-m">${n}</span></button>`,
    )
    .join('')}</div>`;
  let body;
  if (v.mode === 'board') body = boardHtml(ts, key, {});
  else if (v.mode === 'table') body = tableHtml(ts, key);
  else body = `<div class="list-wrap">${listHtml(groupTasks(ts, v.group), key, { cols: ['status', 'assignee', 'priority', 'due', 'project'] })}</div>`;
  return `<div class="page flush tasks-page">
    <div class="ph"><div><h1>Tasks</h1><p>Every task across ${visibleProjects().filter(canSee).length} projects.</p></div><div class="acts"><button class="btn btn-primary" data-a="newTask" aria-label="New task">${ic('plus', 14)}<span class="hide-m">New task</span></button><div class="task-mobile-view">${right}</div></div></div>
    ${viewToolbar(key, { compact: true, right: `<div class="task-wide-view">${right}</div>`, cols: v.mode === 'table', group: v.mode !== 'board' })}
    ${body}
  </div>`;
}
