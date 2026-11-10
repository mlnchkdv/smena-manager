/* ---------- BOARD ---------- */
import { esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { PR, STATUSES } from '../core/constants.js';
import { D, S, commentsOf, mem, pColor, proj } from '../core/store.js';
import { av, dueHtml, lbl, prIcon, progBar, stIcon } from '../ui/helpers.js';
import { fxc, render } from '../shell/render.js';
import { readLayoutPreference, writeLayoutPreference } from '../core/view-layout-preferences.js';
import { listWindow } from '../shared/list-window.js';
import { paginationHtml } from '../ui/pagination.js';
import { uiCount, t as tr, isRussian } from '../core/i18n.js';
import { actionLabel } from '../ui/action-label.js';
import { A } from '../actions/actions.js';

A.focusBoardColumn = el => {
  let board = document.querySelector(`.board[data-board-key="${CSS.escape(el.dataset.key)}"]`);
  let column = board?.querySelector(`[data-drop-col="${CSS.escape(el.dataset.status)}"]`);
  if (column?.dataset.a === 'expandEmptyBoardColumn') {
    A.expandEmptyBoardColumn(column);
    board = document.querySelector(`.board[data-board-key="${CSS.escape(el.dataset.key)}"]`);
    column = board?.querySelector(`[data-drop-col="${CSS.escape(el.dataset.status)}"]`);
  }
  if (!column) return;
  const left =
    board.scrollLeft + column.getBoundingClientRect().left - board.getBoundingClientRect().left - parseFloat(getComputedStyle(board).paddingLeft || 0);
  board.scrollTo({ left, behavior: S.prefs.motion === 'reduce' || matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
};

A.toggleBoardEmptyColumns = el => {
  const key = el.dataset.key;
  writeLayoutPreference(`board-empty:${key}`, !readLayoutPreference(`board-empty:${key}`, false));
  S.ui.expandedEmptyColumns = {};
  render();
};
A.expandEmptyBoardColumn = el => {
  (S.ui.expandedEmptyColumns ||= {})[el.dataset.ck] = true;
  render();
  document.querySelector(`.board [data-ck="${CSS.escape(el.dataset.ck)}"] .addcard`)?.focus({ preventScroll: true });
};

export function kcard(t, opt = {}) {
  const cc = opt.commentCounts ? opt.commentCounts.get(t.id) || 0 : commentsOf(t.id).length;
  const ac = t.attachments.length;
  const sd = t.subtasks.filter(s => s.done).length;
  const p = proj(t.project);
  return `<article class="kcard ${t.status === 'done' ? 'done' : ''}${fxc('done', t.id)}${fxc('added', t.id)}${fxc('moved', t.id)}" draggable="false" data-drag-card="${t.id}" data-id="${t.id}" data-ctx="task" aria-label="${esc(t.title)}">
    ${t.labels.length ? `<div class="labels">${t.labels.map(lbl).join('')}</div>` : ''}
    <div class="top">${t.status === 'done' ? `<span class="done-ic" style="margin:2px 7px 0 0;display:inline-flex" role="img" aria-label="Done">${stIcon('done', 14)}</span>` : ''}<button class="title board-card-open" data-a="openTask" data-id="${t.id}" aria-label="${actionLabel('Open task', t.title, t.key)}" translate="no">${esc(t.title)}</button></div>
    ${t.subtasks.length ? `<div class="subp">${ic('list-checks', 12)}<span class="num">${sd}/${t.subtasks.length}</span>${progBar(Math.round((sd / t.subtasks.length) * 100), sd === t.subtasks.length ? 'green' : '')}</div>` : ''}
    <div class="meta">
      ${opt.showProj ? `<span class="m" data-tip="${esc(p.name)}"><span class="pdot" style="--c:${pColor(p)}"></span></span>` : ''}
      <span class="key">${t.key}</span><span class="board-drag-handle" draggable="true" data-drag-card="${t.id}" aria-hidden="true" data-tip="Drag to move">${ic('grip-vertical', 13)}</span>
      <button class="m" data-a="pop" data-pop="priority" data-id="${t.id}" data-tip="${PR[t.priority].name}" aria-label="Priority: ${PR[t.priority].name}">${prIcon(t.priority, 13)}</button>
      ${t.due ? `<button class="m" data-a="pop" data-pop="date" data-field="due" data-id="${t.id}" aria-label="Due date">${dueHtml(t)}</button>` : ''}
      ${t.recur ? `<span class="m" data-tip="Repeats ${t.recur.toLowerCase()}">${ic('repeat', 12)}</span>` : ''}
      ${cc ? `<span class="m" role="img" aria-label="${esc(uiCount(cc, 'comment'))}">${ic('message-square', 12)}${cc}</span>` : ''}
      ${ac ? `<span class="m" role="img" aria-label="${esc(uiCount(ac, 'attachment'))}">${ic('paperclip', 12)}${ac}</span>` : ''}
      <button class="m board-assignee" data-a="pop" data-pop="assignee" data-id="${t.id}" data-tip="${esc(mem(t.assignee)?.name || 'Unassigned')}" style="margin-left:auto" aria-label="${actionLabel('Assignee', mem(t.assignee)?.name || tr('Unassigned'), t.title)}" translate="no">${av(t.assignee, 'sm', false)}</button>
    </div>
    <div class="hacts"><button class="ibtn ibtn-xs" data-a="toggleDone" data-id="${t.id}" data-tip="${t.status === 'done' ? 'Reopen' : 'Mark complete'}" aria-label="${t.status === 'done' ? 'Reopen' : 'Mark complete'}">${ic(t.status === 'done' ? 'rotate-ccw' : 'check', 13)}</button><button class="ibtn ibtn-xs" data-a="editTask" data-id="${t.id}" data-tip="Quick edit" aria-label="Quick edit">${ic('pencil', 12)}</button><button class="ibtn ibtn-xs" data-a="ctxBtn" data-ctx="task" data-id="${t.id}" aria-label="${actionLabel('Task options', t.title, t.key)}">${ic('ellipsis', 13)}</button></div>
  </article>`;
}
export function boardHtml(ts, key, opt = {}) {
  const compactEmpty = readLayoutPreference(`board-empty:${key}`, false);
  const emptyLabel = isRussian() ? 'Сворачивать пустые колонки' : 'Collapse empty columns';
  const options = `<div class="board-view-options"><button class="btn btn-ghost btn-sm" data-a="toggleBoardEmptyColumns" data-key="${esc(key)}" aria-pressed="${compactEmpty}" title="${isRussian() ? 'Личный вид · это устройство' : 'Personal view · this device'}" translate="no">${ic('columns-3', 14)}${emptyLabel}${compactEmpty ? ic('check', 14) : ''}</button></div>`;
  const commentCounts = new Map();
  for (const comment of D().comments) commentCounts.set(comment.task, (commentCounts.get(comment.task) || 0) + 1);
  const navigation = `<nav class="board-column-nav" aria-label="${tr('Board columns')}">${STATUSES.map(status => `<button class="btn btn-secondary btn-sm" data-a="focusBoardColumn" data-key="${esc(key)}" data-status="${status.id}">${stIcon(status.id, 13)}<span>${status.name}</span><span class="num">${ts.filter(task => task.status === status.id).length}</span></button>`).join('')}</nav>`;
  return `${options}${navigation}<div class="board" data-board-key="${esc(key)}" data-keep="board:${key}">${STATUSES.map(s => {
    const col = ts.filter(t => t.status === s.id).sort((a, b) => a.order - b.order);
    const ck = key + ':' + s.id;
    const pageKey = `board:${ck}`;
    const window = listWindow(col, S.ui.listPages?.[pageKey]);
    if (compactEmpty && !col.length && !S.ui.expandedEmptyColumns?.[ck])
      return `<button class="bcol collapsed" data-a="expandEmptyBoardColumn" data-ck="${esc(ck)}" data-drop-col="${s.id}" data-key="${esc(key)}" aria-label="${esc(tr('Expand') + ' ' + tr(s.name))}" title="${esc(tr('Expand') + ' ' + tr(s.name))}">${stIcon(s.id)}<span class="vname">${s.name}<span class="faint">0</span></span></button>`;
    if (S.ui.collapsedCols[ck])
      return `<div class="bcol collapsed" data-a="toggleCol" data-ck="${ck}" data-drop-col="${s.id}" data-key="${key}" role="button" aria-label="Expand ${s.name}" title="Expand">${stIcon(s.id)}<span class="vname">${s.name}<span class="faint">${col.length}</span></span></div>`;
    const comp = S.ui.composer && S.ui.composer.ctx === key && S.ui.composer.group === s.id;
    return `<section class="bcol" data-ck="${esc(ck)}" data-drop-col="${s.id}" data-key="${key}" aria-label="${s.name}">
      <div class="bcol-h">${stIcon(s.id)}<span>${s.name}</span><span class="cnt">${col.length}</span>
        <span class="acts"><button class="ibtn ibtn-xs" data-a="startComposer" data-ctx="${key}" data-group="${s.id}" data-gb='${JSON.stringify({ status: s.id, ...(opt.project ? { project: opt.project } : {}) })}' data-tip="Add task" aria-label="Add task to ${s.name}">${ic('plus', 14)}</button><button class="ibtn ibtn-xs" data-a="ctxBtn" data-ctx="column" data-id="${s.id}" data-key="${key}" aria-label="Column options">${ic('ellipsis', 14)}</button></span></div>
      <div class="bcol-b" data-col-body="${s.id}">
        ${window.items.map(t => kcard(t, { showProj: !opt.project, commentCounts })).join('')}
        ${paginationHtml(window, pageKey)}
        ${
          comp
            ? `<div class="composer"><textarea id="composer-in" data-in="composer" data-key-enter="commitComposer" placeholder="Task name" rows="2" aria-label="New task name">${esc(S.ui.composer.title || '')}</textarea><div class="row"><span class="faint" style="font-size:11px">Enter to add · Esc to cancel</span><span class="sp"></span><button class="btn btn-sm btn-ghost" data-a="cancelComposer">Cancel</button><button class="btn btn-sm btn-primary" data-a="commitComposer">Add</button></div></div>`
            : `<button class="addcard" data-a="startComposer" data-ctx="${key}" data-group="${s.id}" data-gb='${JSON.stringify({ status: s.id, ...(opt.project ? { project: opt.project } : {}) })}'>${ic('plus', 14)}Add task</button>`
        }
      </div>
    </section>`;
  }).join('')}</div>`;
}
