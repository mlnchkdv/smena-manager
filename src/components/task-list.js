/* =====================================================================
   PAGES
   ===================================================================== */
import { ago, esc, relDate, fmtDate, fmtTimestamp } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { PR, ST } from '../core/constants.js';
import { D, S, commentsOf, isOver, mem, pColor, proj, task } from '../core/store.js';
import { av, dueHtml, empty, lbl, prIcon, prPill, stIcon, stPill } from '../ui/helpers.js';
import { fxc } from '../shell/render.js';
import { activityExtra, inProject, isRussian, t as tr } from '../core/i18n.js';
import { listWindow } from '../shared/list-window.js';
import { activityDateExtra, activityVerbForm } from '../shared/activity-copy.js';
import { selectedEditableTasks } from '../shared/task-bulk-scope.js';
import { canEditProject } from '../shared/project-access.js';

/* ---------- shared list renderer ---------- */
export const LCOLS = {
  status: ['Status', '140px'],
  assignee: ['Assignee', '150px'],
  priority: ['Priority', '108px'],
  due: ['Due date', '148px'],
  labels: ['Labels', '168px'],
  project: ['Project', '160px'],
};
export function cellStatus(t) {
  return `<button class="pillbtn" data-a="pop" data-pop="status" data-id="${t.id}" aria-label="${esc(tr('Status'))}: ${esc(tr(ST[t.status].name))}">${stPill(t.status)}</button>`;
}
export function cellAssignee(t) {
  const m = mem(t.assignee);
  return `<button class="pillbtn ${m ? '' : 'empty'}" data-a="pop" data-pop="assignee" data-id="${t.id}" aria-label="${esc(tr('Assignee'))}: ${esc(m?.name || tr('Unassigned'))}">${av(t.assignee, 'sm', false)}<span class="trunc" ${m ? 'translate="no"' : ''}>${m ? esc(m.name) : 'Unassigned'}</span></button>`;
}
export function cellPrio(t) {
  return `<button class="pillbtn ${t.priority === 'none' ? 'empty' : ''}" data-a="pop" data-pop="priority" data-id="${t.id}" aria-label="${esc(tr('Priority'))}: ${esc(tr(PR[t.priority]?.name || t.priority))}">${prPill(t.priority)}</button>`;
}
export function cellDue(t) {
  return `<button class="pillbtn ${t.due ? (isOver(t) ? 'over' : '') : 'empty'}" data-a="pop" data-pop="date" data-field="due" data-id="${t.id}"><span class="sr">${esc(tr('Due date'))}: </span>${t.due ? `${ic('calendar', 13)}<span class="num">${relDate(t.due)}</span>` : `${ic('calendar', 13)}<span>Set date</span>`}</button>`;
}
export function cellLabels(t) {
  const shown = isRussian() ? 1 : 2;
  return `<button class="pillbtn ${t.labels.length ? '' : 'empty'}" data-a="pop" data-pop="labels" data-id="${t.id}" style="gap:4px;overflow:hidden"><span class="sr">${esc(tr('Labels'))}: </span>${t.labels.length ? t.labels.slice(0, shown).map(lbl).join('') + (t.labels.length > shown ? `<span class="faint" style="font-size:11px">+${t.labels.length - shown}</span>` : '') : `${ic('tag', 13)}<span>Add</span>`}</button>`;
}
export function cellProject(t) {
  const p = proj(t.project);
  return `<button class="pillbtn" data-a="pop" data-pop="project" data-id="${t.id}" aria-label="${esc(tr('Project'))}: ${esc(p?.name || '')}"><span class="pdot" style="--c:${pColor(p)}"></span><span class="trunc" translate="no">${esc(p?.name)}</span></button>`;
}
export const CELL = { status: cellStatus, assignee: cellAssignee, priority: cellPrio, due: cellDue, labels: cellLabels, project: cellProject };

export function taskRow(t, cols, tpl, opt = {}) {
  const editable = canEditProject(proj(t.project), D().me, S.ui.currentUser?.role || 'viewer');
  const sel = editable && S.ui.sel.has(t.id);
  const open = S.ui.openTasks[t.id];
  const editing = S.ui.editCell && S.ui.editCell.id === t.id && S.ui.editCell.f === 'title';
  const cc = opt.commentCounts ? opt.commentCounts.get(t.id) || 0 : commentsOf(t.id).length;
  const sd = t.subtasks.filter(s => s.done).length;
  return `<div class="trow ${t.status === 'done' ? 'done' : ''} ${sel ? 'sel' : ''}${fxc('done', t.id)}${fxc('added', t.id)}" role="row" style="--cols:${tpl}" data-task-row="${t.id}" data-group="${opt.group || ''}" data-lkey="${opt.key || ''}" data-ctx="task" data-id="${t.id}">
    <div class="handle" role="cell" draggable="${opt.drag !== false}" data-drag-row="${t.id}" aria-hidden="true">${opt.drag !== false ? ic('grip-vertical', 14) : ''}</div>
    <div class="c-check" role="cell">${
      opt.complete
        ? `<input type="checkbox" class="check round" ${t.status === 'done' ? 'checked' : ''} data-a="toggleDone" data-id="${t.id}" aria-label="Mark ${esc(t.title)} complete">`
        : `<input type="checkbox" class="check" ${sel ? 'checked' : ''} ${editable ? '' : 'disabled'} data-a="selRow" data-id="${t.id}" aria-label="Select ${esc(t.title)}">`
    }</div>
    <div class="ttl" role="cell" data-id="${t.id}" data-dbl="editTitle">
      ${t.subtasks.length ? `<span class="ibtn ibtn-xs" data-a="expandRow" data-id="${t.id}" aria-label="${open ? 'Hide' : 'Show'} subtasks" aria-expanded="${!!open}" style="margin-left:-4px">${ic(open ? 'chevron-down' : 'chevron-right', 13)}</span>` : '<span style="width:18px;flex-shrink:0"></span>'}
      ${editing ? '' : `<button class="task-title-open" data-a="openTask" data-id="${t.id}">`}<span class="key" translate="no">${t.key}</span>
      ${editing ? `<input class="inline-in" id="edit-title" data-in="noop" data-blur="commitTitle" data-key-enter="commitTitle" data-id="${t.id}" value="${esc(t.title)}" aria-label="Task title">` : `<span class="tt" translate="no">${esc(t.title)}</span>`}
      ${t.recur ? `<span class="meta-mini" data-tip="Repeats ${t.recur.toLowerCase()}">${ic('repeat', 11)}</span>` : ''}
      ${t.subtasks.length ? `<span class="meta-mini">${ic('list-checks', 11)}${sd}/${t.subtasks.length}</span>` : ''}
      ${cc ? `<span class="meta-mini">${ic('message-square', 11)}${cc}</span>` : ''}${editing ? '' : '</button>'}
    </div>
    ${cols.map(c => `<div class="c-meta c-${c === 'labels' ? 'lbl' : c}" role="cell">${CELL[c](t)}</div>`).join('')}
    <div class="c-more" role="cell"><button class="ibtn ibtn-sm" data-a="ctxBtn" data-ctx="task" data-id="${t.id}" aria-label="More actions">${ic('ellipsis', 15)}</button></div>
  </div>
  ${open ? `<div class="subrows" role="rowgroup">${t.subtasks.map(s => `<div role="row"><div class="subrow ${s.done ? 'done' : ''}" role="cell" aria-colspan="${cols.length + 4}"><input type="checkbox" class="check" ${s.done ? 'checked' : ''} data-a="toggleSub" data-id="${t.id}" data-sid="${s.id}" aria-label="${esc(tr('Complete subtask'))}: ${esc(s.title)}"><span translate="no">${esc(s.title)}</span></div></div>`).join('')}</div>` : ''}`;
}
export function listHtml(groups, key, opt = {}) {
  const cols = opt.cols || ['status', 'assignee', 'priority', 'due', 'labels'];
  const tpl = `18px 30px minmax(220px,1fr) ${cols.map(c => LCOLS[c][1]).join(' ')} 40px`;
  const all = groups.flatMap(g => g.tasks.map(t => t.id));
  const commentCounts = new Map();
  for (const comment of D().comments) commentCounts.set(comment.task, (commentCounts.get(comment.task) || 0) + 1);
  const windows = new Map(
    groups.map(group => {
      const groupKey = `${key}:${group.key}`;
      return [group.key, { ...listWindow(group.tasks, S.ui.listPages?.[groupKey]), collapsed: S.ui.collapsedGroups[groupKey] ?? (group.collapsed || false) }];
    }),
  );
  const visibleIds = groups.flatMap(group => (windows.get(group.key).collapsed ? [] : windows.get(group.key).items.map(task => task.id)));
  const nSel = visibleIds.filter(id => S.ui.sel.has(id)).length;
  const total = all.length;
  if (!total && !opt.keepEmpty)
    return (
      opt.emptyHtml ||
      empty(
        'list-checks',
        'No tasks here',
        'Add a task to get things moving.',
        `<button class="btn btn-primary btn-sm" data-a="newTask" ${opt.project ? `data-project="${opt.project}"` : ''}>${ic('plus', 14)}New task</button>`,
      )
    );
  const v = S.views[key];
  const columnCount = cols.length + 4;
  const sortHeader = (field, label) =>
    `<div role="columnheader" ${v?.sort.f === field ? `aria-sort="${v.sort.dir > 0 ? 'ascending' : 'descending'}"` : ''}><button class="task-sort-header" data-a="sortBy" data-key="${key}" data-f="${field}">${label}${v?.sort.f === field ? ic(v.sort.dir > 0 ? 'arrow-up' : 'arrow-down', 11) : ''}</button></div>`;
  return `<div class="tlist" role="table" aria-label="Tasks">
    <div class="thead" style="--cols:${tpl}" role="row">
      <div role="columnheader" aria-hidden="true"></div>
      <div role="columnheader">${opt.complete ? '' : `<input type="checkbox" class="check" data-a="selAll" data-key="${key}" ${nSel && nSel === visibleIds.length ? 'checked' : ''} ${nSel && nSel < visibleIds.length ? 'data-indet="1"' : ''} aria-label="Select visible tasks">`}</div>
      ${sortHeader('title', 'Task')}
      ${cols.map(c => sortHeader(c === 'labels' ? 'manual' : c, LCOLS[c][0])).join('')}
      <div role="columnheader"><span class="sr">More actions</span></div>
    </div>
    ${groups
      .map(g => {
        const gk = key + ':' + g.key;
        const window = windows.get(g.key);
        const coll = S.ui.collapsedGroups[gk] ?? (g.collapsed || false);
        const comp = S.ui.composer && S.ui.composer.ctx === key && S.ui.composer.group === g.key;
        return `${
          groups.length > 1 || g.key !== 'all'
            ? `<div role="row"><div class="grp" role="cell" aria-colspan="${columnCount}" data-grp-drop="${g.key}" data-key="${key}">
          <button class="ibtn ibtn-xs" data-a="toggleGroup" data-gk="${gk}" aria-expanded="${!coll}" aria-label="Toggle group">${ic(coll ? 'chevron-right' : 'chevron-down', 13)}</button>
          ${g.html || ''}<span>${esc(g.name)}</span><span class="cnt">${g.tasks.length}</span>
          ${opt.noAdd ? '' : `<button class="ibtn ibtn-xs" data-a="startComposer" data-ctx="${key}" data-group="${g.key}" data-gb="${esc(JSON.stringify(g.set || {}))}" aria-label="Add task to ${esc(g.name)}">${ic('plus', 13)}</button>`}
        </div></div>`
            : ''
        }
        ${coll ? '' : window.items.map(t => taskRow(t, cols, tpl, { group: g.key, drag: opt.drag, complete: opt.complete, key, commentCounts })).join('')}
        ${!coll && window.pages > 1 ? `<div role="row"><div class="row" role="cell" aria-colspan="${columnCount}" style="justify-content:center;gap:12px;padding:10px;flex-wrap:wrap"><button class="btn btn-sm btn-secondary" data-a="listPage" data-key="${esc(gk)}" data-page="${window.page - 1}" ${window.page === 0 ? 'disabled' : ''}>Previous</button><span class="hint"><span>Page</span> ${window.page + 1} / ${window.pages}</span><button class="btn btn-sm btn-secondary" data-a="listPage" data-key="${esc(gk)}" data-page="${window.page + 1}" ${window.page + 1 === window.pages ? 'disabled' : ''}>Next</button></div></div>` : ''}
        ${coll || opt.noAdd ? '' : `<div role="row"><div role="cell" aria-colspan="${columnCount}">${comp ? `<div class="addrow" style="background:var(--surface-2)">${ic('plus', 14)}<input class="inline-in" id="composer-in" data-key-enter="commitComposer" placeholder="Task name — press Enter to add, Esc to cancel" aria-label="New task name"></div>` : `<button class="addrow" data-a="startComposer" data-ctx="${key}" data-group="${g.key}" data-gb="${esc(JSON.stringify(g.set || {}))}">${ic('plus', 14)}Add task</button>`}</div></div>`}`;
      })
      .join('')}
  </div>${bulkBar(all)}`;
}
export function bulkBar(ids) {
  const selected = selectedEditableTasks(ids, S.ui.sel, D(), S.ui.currentUser?.role || 'viewer').map(task => task.id);
  const n = selected.length;
  if (!n) return '';
  return `<div class="bulkbar${S.ui.fx.bulk ? ' enter' : ''}" data-task-scope="${esc(JSON.stringify(selected))}" role="toolbar" aria-label="Bulk actions"><b style="font-weight:600">${n} selected</b><span class="sep"></span>
    <button class="btn btn-sm" data-a="pop" data-pop="bulk-status">${ic('circle-dot', 14)}Status</button>
    <button class="btn btn-sm" data-a="pop" data-pop="bulk-assignee">${ic('user', 14)}Assignee</button>
    <button class="btn btn-sm" data-a="pop" data-pop="bulk-priority">${ic('signal-high', 14)}Priority</button>
    <button class="btn btn-sm" data-a="bulkDelete">${ic('trash-2', 14)}Delete</button><span class="sep"></span>
    <button class="btn btn-sm" data-a="clearSel" aria-label="Clear selection">${ic('x', 14)}</button></div>`;
}

/* ---------- activity rendering ---------- */
export function actHtml(a, opt = {}) {
  const m = mem(a.by);
  const t = a.task ? task(a.task) : null;
  const p = a.project ? proj(a.project) : null;
  const obj = t
    ? `<button type="button" class="obj" data-a="openTask" data-id="${t.id}" translate="no">${esc(t.title)}</button>`
    : p
      ? `<button type="button" class="obj" data-a="go" data-r="project" data-id="${p.id}" translate="no">${esc(p.name)}</button>`
      : '';
  const self = a.by === D().me;
  const locale = isRussian() ? 'ru-RU' : 'en-US';
  const extra = activityDateExtra(a, locale, value => fmtDate(value, true)) ?? activityExtra(a.extra, a.verb, a.change);
  return `<div class="fitem" ${a.id ? `id="activity-${esc(a.id)}" data-activity-id="${esc(a.id)}"` : ''}>${av(a.by, 'sm')}<div class="grow"><b translate="no">${esc(self ? tr('You') : m?.name || tr('Someone'))}</b> <span class="muted">${esc(activityVerbForm(tr(a.verb), self, locale))}</span> ${obj} ${extra ? `<span class="muted" translate="no">${esc(extra)}</span>` : ''}${opt.proj && p && t ? ` <span class="faint" translate="no">${esc(inProject(p.name))}</span>` : ''}</div><time title="${esc(fmtTimestamp(a.at))}">${ago(a.at)}</time></div>`;
}
export function miniRow(t, opt = {}) {
  const p = proj(t.project);
  return `<div class="mini mini-task ${t.status === 'done' ? 'done' : ''}${fxc('done', t.id)}${fxc('added', t.id)}" data-id="${t.id}" data-ctx="task">
    <label class="mini-complete-target"><input type="checkbox" class="check round" ${S.ui.currentUser?.role === 'viewer' ? 'disabled' : ''} ${t.status === 'done' ? 'checked' : ''} data-a="toggleDone" data-id="${t.id}" aria-label="Complete ${esc(t.title)}"></label>
    <span class="mini-task-status" data-tip="${ST[t.status].name}">${stIcon(t.status)}</span>
    <div class="mini-task-content"><button type="button" class="tt mini-task-open" data-a="openTask" data-id="${t.id}" translate="no">${esc(t.title)}</button><div class="mini-task-context">${opt.noProj ? '' : `<span class="trunc" translate="no">${esc(p?.name || '')}</span>`}${t.due ? dueHtml(t, false) : ''}</div></div>
    ${opt.noProj ? '' : `<span class="pj hide-m"><span class="pdot" style="--c:${pColor(p)}"></span><span class="trunc" translate="no">${esc(p.name)}</span></span>`}
    ${t.priority !== 'none' ? `<span data-tip="${PR[t.priority].name} priority">${prIcon(t.priority)}</span>` : ''}
    <span style="width:74px;text-align:right" class="hide-m mini-task-due">${dueHtml(t, false)}</span>
    ${opt.av === false ? '' : av(t.assignee, 'sm')}
  </div>`;
}
