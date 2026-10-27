/* ---------- TABLE ---------- */
import { esc, fmtDate, iso } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { D, S, isOver, mem, pColor, proj, task } from '../core/store.js';
import { canEditProject } from '../shared/project-access.js';
import { av, dueHtml, empty, lbl, prPill, stIcon, stPill } from '../ui/helpers.js';
import { groupTasks, viewOf } from '../shell/view-engine.js';
import { listWindow } from '../shared/list-window.js';
import { paginationHtml } from '../ui/pagination.js';

export const TCOLS = [
  ['title', 'Task', 314],
  ['status', 'Status', 140],
  ['priority', 'Priority', 124],
  ['assignee', 'Assignee', 166],
  ['due', 'Due date', 132],
  ['start', 'Start date', 124],
  ['labels', 'Labels', 190],
  ['deps', 'Dependencies', 150],
  ['estimate', 'Estimate', 100],
  ['created', 'Created', 112],
  ['project', 'Project', 166],
];
function mobileTable(groups, cols, group) {
  const visible = new Set(cols.map(col => col[0]));
  return `<div class="only-m mobile-task-table">${groups
    .filter(g => g.tasks.length)
    .map(
      g =>
        `<section>${group !== 'none' ? `<h2 class="mobile-table-group">${g.html || ''}<span ${['project', 'assignee'].includes(group) && g.key !== 'none' ? 'translate="no"' : ''}>${esc(g.name)}</span><span class="faint">${g.tasks.length}</span></h2>` : ''}${g.tasks
          .map(
            t =>
              `<button class="panel mobile-table-task" data-a="openTask" data-id="${t.id}"><span class="row">${visible.has('status') ? stIcon(t.status) : ''}<b class="grow" translate="no">${esc(t.title)}</b><span class="mono faint">${esc(t.key)}</span></span><span class="row muted mobile-table-fields">${visible.has('priority') ? prPill(t.priority) : ''}${visible.has('assignee') ? `<span class="row">${av(t.assignee, 'sm', false)}<span ${t.assignee ? 'translate="no"' : ''}>${esc(mem(t.assignee)?.name || 'Unassigned')}</span></span>` : ''}${visible.has('due') ? dueHtml(t) : ''}${visible.has('start') && t.start ? `<span>${ic('calendar', 12)}<span>Start date</span>: ${fmtDate(t.start)}</span>` : ''}${visible.has('project') ? `<span translate="no">${esc(proj(t.project)?.name || '')}</span>` : ''}${visible.has('labels') ? t.labels.map(lbl).join('') : ''}${visible.has('estimate') && t.estimate ? `<span>${ic('timer', 12)} ${esc(t.estimate)}</span>` : ''}${
                visible.has('deps')
                  ? t.deps
                      .filter(id => task(id))
                      .map(id => `<span class="depchip">${esc(task(id).key)}</span>`)
                      .join('')
                  : ''
              }${visible.has('created') ? `<span><span>Created</span>: ${fmtDate(iso(new Date(t.created)))}</span>` : ''}</span></button>`,
          )
          .join('')}</section>`,
    )
    .join('')}</div>`;
}
export function tcell(t, c) {
  const ed = S.ui.editCell && S.ui.editCell.id === t.id && S.ui.editCell.f === c;
  switch (c) {
    case 'title':
      return ed
        ? `<td class="sticky editing"><input id="edit-cell" data-blur="commitCell" data-key-enter="commitCell" data-id="${t.id}" data-f="title" value="${esc(t.title)}" aria-label="Task title"></td>`
        : `<td class="sticky task-title-cell"><div class="row"><button class="task-table-open" data-a="openTask" data-id="${t.id}">${stIcon(t.status, 13)}<span class="trunc" translate="no">${esc(t.title)}</span><span class="mono faint">${esc(t.key)}</span></button>${canEditProject(proj(t.project), D().me, S.ui.currentUser?.role) ? `<button class="ibtn ibtn-sm task-table-rename" data-a="editCell" data-id="${t.id}" data-f="title" aria-label="Rename task" aria-describedby="task-title-${esc(t.id)}" title="Rename task">${ic('pencil', 13)}<span class="sr" id="task-title-${esc(t.id)}" translate="no">${esc(t.title)}</span></button>` : ''}</div></td>`;
    case 'status':
      return `<td class="cellbtn" data-a="pop" data-pop="status" data-id="${t.id}"><span class="row" style="gap:6px">${stPill(t.status)}</span></td>`;
    case 'priority':
      return `<td class="cellbtn" data-a="pop" data-pop="priority" data-id="${t.id}"><span class="row" style="gap:6px">${prPill(t.priority)}</span></td>`;
    case 'assignee':
      return `<td class="cellbtn" data-a="pop" data-pop="assignee" data-id="${t.id}"><span class="row" style="gap:6px">${av(t.assignee, 'sm', false)}<span class="trunc ${t.assignee ? '' : 'faint'}" ${t.assignee ? 'translate="no"' : ''}>${esc(mem(t.assignee)?.name || 'Unassigned')}</span></span></td>`;
    case 'due':
      return `<td class="cellbtn num ${isOver(t) ? '' : ''}" data-a="pop" data-pop="date" data-field="due" data-id="${t.id}" style="${isOver(t) ? 'color:var(--red)' : ''}">${t.due ? fmtDate(t.due) : '<span class="faint">—</span>'}</td>`;
    case 'start':
      return `<td class="cellbtn num" data-a="pop" data-pop="date" data-field="start" data-id="${t.id}">${t.start ? fmtDate(t.start) : '<span class="faint">—</span>'}</td>`;
    case 'labels':
      return `<td class="cellbtn" data-a="pop" data-pop="labels" data-id="${t.id}"><span class="row" style="gap:4px">${t.labels.map(lbl).join('') || '<span class="faint">—</span>'}</span></td>`;
    case 'deps':
      return `<td class="cellbtn" data-a="pop" data-pop="deps" data-id="${t.id}">${t.deps.map(d => (task(d) ? `<span class="depchip" title="${esc(task(d).title)}">${task(d).key}</span>` : '')).join('') || '<span class="faint">—</span>'}</td>`;
    case 'estimate':
      return ed
        ? `<td class="editing"><input id="edit-cell" data-blur="commitCell" data-key-enter="commitCell" data-id="${t.id}" data-f="estimate" value="${esc(t.estimate || '')}" placeholder="e.g. 2d" aria-label="Estimate"></td>`
        : `<td class="cellbtn num" data-dbl="editCell" data-id="${t.id}" data-f="estimate" data-a="editCell" title="Click to edit">${t.estimate ? esc(t.estimate) : '<span class="faint">—</span>'}</td>`;
    case 'created':
      return `<td class="num muted">${fmtDate(iso(new Date(t.created)))}</td>`;
    case 'project':
      return `<td class="cellbtn" data-a="pop" data-pop="project" data-id="${t.id}"><span class="row" style="gap:6px"><span class="pdot" style="--c:${pColor(proj(t.project))}"></span><span class="trunc" translate="no">${esc(proj(t.project).name)}</span></span></td>`;
  }
}
export function tableHtml(ts, key, p) {
  const pageKey = `table:${key}`;
  const window = listWindow(ts, S.ui.listPages?.[pageKey]);
  ts = window.items;
  const v = viewOf(key);
  if (p && !v._projHidden) {
    v._projHidden = true;
    if (!v.hidden.includes('project')) v.hidden.push('project');
  }
  const cols = TCOLS.filter(c => c[0] === 'title' || !v.hidden.includes(c[0]));
  const w = c => v.colW[c[0]] || c[2];
  const groups = groupTasks(ts, v.group);
  const totalW = cols.reduce((a, c) => a + w(c), 0);
  if (!ts.length)
    return empty(
      'search-x',
      'No results found',
      'No tasks match these filters.',
      `<button class="btn btn-secondary btn-sm" data-a="clearFilters" data-key="${key}">Clear filters</button>`,
    );
  return `<div class="tbl-wrap hide-m" data-keep="tbl:${key}"><table class="tbl" style="width:${totalW}px" aria-label="Tasks table">
    <colgroup>${cols.map(c => `<col data-col="${c[0]}" style="width:${w(c)}px">`).join('')}</colgroup>
    <thead><tr>${cols.map(c => `<th class="${c[0] === 'title' ? 'sticky' : ''}" style="position:sticky" scope="col"><div class="thi" data-a="sortBy" data-key="${key}" data-f="${['labels', 'deps'].includes(c[0]) ? 'manual' : c[0]}">${c[1]}${v.sort.f === c[0] ? ic(v.sort.dir > 0 ? 'arrow-up' : 'arrow-down', 11) : ''}</div><span class="rsz" data-rsz="${c[0]}" data-key="${key}" aria-hidden="true"></span></th>`).join('')}</tr></thead>
    <tbody>${groups
      .map(
        g => `${v.group !== 'none' ? `<tr class="grow-row"><td class="sticky" colspan="${cols.length}"><span class="row" style="gap:6px">${g.html || ''}<span ${(v.group === 'project' || v.group === 'assignee') && g.key !== 'none' ? 'translate="no"' : ''}>${esc(g.name)}</span><span class="faint" style="font-weight:500">${g.tasks.length}</span></span></td></tr>` : ''}
      ${g.tasks.map(t => `<tr data-ctx="task" data-id="${t.id}">${cols.map(c => tcell(t, c[0])).join('')}</tr>`).join('')}`,
      )
      .join('')}
      <tr><td class="sticky cellbtn" data-a="newTask" ${p ? `data-project="${p.id}"` : ''} colspan="${cols.length}" style="color:var(--text-3)"><span class="row" style="gap:6px">${ic('plus', 14)}New task</span></td></tr>
    </tbody></table></div>${mobileTable(groups, cols, v.group)}${paginationHtml(window, pageKey)}`;
}
