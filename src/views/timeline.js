/* ---------- TIMELINE ---------- */
import { $, MON, MONL, TODAY, addD, diffD, esc, fmtDate, parse, iso } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { S, allTasks, canSee, pColor, proj, task, taskProg, visibleProjects } from '../core/store.js';
import { av, empty, stIcon } from '../ui/helpers.js';
import { applyView, groupTasks, viewOf, viewToolbar } from '../shell/view-engine.js';
import { startOfWeek } from '../core/calendar-layout.js';
import { timelineMilestones } from '../shared/timeline-scope.js';
import { listWindow } from '../shared/list-window.js';
import { paginationHtml } from '../ui/pagination.js';

export const timelineListMode = () =>
  S.ui.tlPresentation ? S.ui.tlPresentation === 'list' : (document.querySelector('.main')?.clientWidth || innerWidth) <= 640;
const listMode = timelineListMode;

export function tlControls() {
  return `<div class="seg" role="group" aria-label="Timeline presentation"><button class="${listMode() ? 'on' : ''}" aria-pressed="${listMode()}" data-a="set" data-k="tlPresentation" data-v="list">List</button><button class="${!listMode() ? 'on' : ''}" aria-pressed="${!listMode()}" data-a="set" data-k="tlPresentation" data-v="chart">Timeline</button></div><input type="date" class="input tl-date-picker" data-in="tlAnchor" value="${S.ui.tlAnchor || iso(TODAY)}" aria-label="Focus date"><div class="seg" style="margin-left:4px;${listMode() ? 'display:none' : ''}">${[
    ['week', 'Weeks'],
    ['month', 'Months'],
  ]
    .map(([k, n]) => `<button class="${S.ui.tlZoom === k ? 'on' : ''}" data-a="set" data-k="tlZoom" data-v="${k}">${n}</button>`)
    .join('')}</div>
  ${
    listMode()
      ? ''
      : `<select class="select" style="height:26px;width:auto;font-size:12px;margin-left:4px" data-in="tlGroup" aria-label="Group by">${[
          ['status', 'Status'],
          ['assignee', 'Assignee'],
          ['project', 'Project'],
          ['none', 'No grouping'],
        ]
          .map(([k, n]) => `<option value="${k}" ${S.ui.tlGroup === k ? 'selected' : ''}>${n}</option>`)
          .join('')}</select>`
  }
  <button class="btn btn-ghost" data-a="tlToday">${ic('crosshair', 14)}Today</button>`;
}
export function timelineHtml(ts, key, p) {
  if (listMode()) {
    const items = [
      ...ts.filter(t => t.due).map(t => ({ date: t.due, task: t })),
      ...timelineMilestones(ts, visibleProjects().filter(canSee), p).map(m => ({ date: m.date, milestone: m })),
    ].sort((a, b) => a.date.localeCompare(b.date));
    const anchorKey = `${key}:${S.ui.tlAnchor || ''}`;
    S.ui.listPages ||= {};
    if (S.ui.tlAnchorKey !== anchorKey) {
      S.ui.tlAnchorKey = anchorKey;
      const position = items.findIndex(item => item.date >= (S.ui.tlAnchor || iso(TODAY)));
      S.ui.listPages.timeline = Math.floor(Math.max(0, position) / 60);
    }
    const page = listWindow(items, S.ui.listPages.timeline, 60);
    return `<div class="tl-agenda" data-keep="timeline-agenda:${key}"><p class="hint">Chronological order</p>${
      page.items
        .map((item, i) => {
          const m = item.milestone;
          const project = m?.p || proj(item.task?.project);
          return `${i === 0 || page.items[i - 1].date !== item.date ? `<h3 class="hint">${fmtDate(item.date, true)}</h3>` : ''}<button class="tl-agenda-item" ${m ? `data-a="go" data-r="project" data-id="${project?.id || ''}" data-tab="overview"` : `data-a="openTask" data-id="${item.task.id}"`}><span>${m ? ic('diamond', 15) : stIcon(item.task.status, 15)}</span><span class="grow min0"><strong translate="no">${esc(m?.name || item.task.title)}</strong><span class="hint" translate="no">${esc(project?.name || '')}</span></span><span class="num">${fmtDate(item.date)}</span>${m ? '' : av(item.task.assignee, 'sm', false)}</button>`;
        })
        .join('') || empty('calendar', 'Nothing on the timeline', 'Give tasks a start and due date to see them here.')
    }${paginationHtml(page, 'timeline')}</div>`;
  }
  const dw = S.ui.tlZoom === 'week' ? 32 : 11;
  const rs = startOfWeek(addD(parse(S.ui.tlAnchor || iso(TODAY)), S.ui.tlZoom === 'week' ? -21 : -56));
  const nDays = S.ui.tlZoom === 'week' ? 7 * 13 : 7 * 34;
  const X = ds => diffD(parse(ds), rs) * dw;
  const g = S.ui.tlGroup;
  const groups = groupTasks(
    ts.filter(t => t.due),
    g === 'project' && p ? 'status' : g,
  ).filter(G => G.tasks.length);
  const rows = [];
  const ms = timelineMilestones(ts, visibleProjects().filter(canSee), p);
  if (ms.length) rows.push({ type: 'ms' });
  groups.forEach(G => {
    if (g !== 'none') rows.push({ type: 'g', G });
    G.tasks.sort((a, b) => ((a.start || a.due) > (b.start || b.due) ? 1 : -1)).forEach(t => rows.push({ type: 't', t }));
  });
  const RH = 36;
  const H = rows.length * RH;
  const W = nDays * dw;
  const rowY = {};
  rows.forEach((r, i) => {
    if (r.type === 't') rowY[r.t.id] = i * RH + RH / 2;
  });
  // header
  let months = [],
    cm = null;
  for (let i = 0; i < nDays; i++) {
    const d = addD(rs, i);
    const k = d.getMonth() + '-' + d.getFullYear();
    if (k !== cm) {
      months.push({ d, i, n: 0 });
      cm = k;
    }
    months[months.length - 1].n++;
  }
  const days =
    S.ui.tlZoom === 'week'
      ? Array.from({ length: nDays }, (_, i) => {
          const d = addD(rs, i);
          return `<div style="width:${dw}px" class="${diffD(d, TODAY) === 0 ? 'today' : ''}">${d.getDate()}</div>`;
        }).join('')
      : Array.from({ length: nDays / 7 }, (_, i) => {
          const d = addD(rs, i * 7);
          return `<div style="width:${dw * 7}px">${MON[d.getMonth()]} ${d.getDate()}</div>`;
        }).join('');
  const weekend =
    S.ui.tlZoom === 'week'
      ? Array.from({ length: nDays }, (_, i) => {
          const d = addD(rs, i);
          return d.getDay() === 0 || d.getDay() === 6 ? `<div class="tl-we" style="left:${i * dw}px;width:${dw}px"></div>` : '';
        }).join('')
      : '';
  const glines = Array.from({ length: nDays / 7 }, (_, i) => `<div class="tl-gl" style="left:${i * 7 * dw}px"></div>`).join('');
  const bars = rows
    .map((r, i) => {
      const y = i * RH;
      if (r.type === 'g') return `<div class="tl-rowbg g" style="top:${y}px"></div>`;
      if (r.type === 'ms') return `<div class="tl-rowbg" style="top:${y}px"></div>` + msLane(ms, X, dw, y);
      const t = r.t;
      const pp = proj(t.project);
      const s = t.start && t.start <= t.due ? t.start : t.due;
      const x = X(s);
      const w = Math.max(dw, (diffD(parse(t.due), parse(s)) + 1) * dw);
      const c = g === 'status' || g === 'none' ? pColor(pp) : `var(--st-${t.status})`;
      const inside = w > 110;
      return `<div class="tl-rowbg" style="top:${y}px"></div><div class="bar ${t.status === 'done' ? 'done' : ''}" style="--c:${c};left:${x}px;top:${y + 7}px;width:${w}px" data-bar="${t.id}" data-dw="${dw}" data-a="openTask" data-id="${t.id}" data-ctx="task" title="${esc(t.title)} · ${fmtDate(s)} → ${fmtDate(t.due)}"><span class="pf" style="width:${taskProg(t)}%"></span>${inside ? `${av(t.assignee, 'sm', false)}<span class="trunc" translate="no">${esc(t.title)}</span>` : ''}</div>${inside ? '' : `<div class="bar-lbl" style="left:${x + w + 8}px;top:${y + 10}px" translate="no">${esc(t.title)}</div>`}`;
    })
    .join('');
  // dependency paths
  const deps = ts
    .flatMap(t =>
      t.deps
        .filter(d => rowY[d] != null && rowY[t.id] != null)
        .map(d => {
          const a = task(d);
          const x1 = X(a.due) + dw;
          const y1 = rowY[d];
          const s = t.start && t.start <= t.due ? t.start : t.due;
          const x2 = X(s);
          const y2 = rowY[t.id];
          const mx = Math.max(x1 + 10, x2 - 10);
          return `<path d="M${x1} ${y1} C ${mx} ${y1}, ${Math.min(x1 + 10, x2 - 10)} ${y2}, ${x2 - 1} ${y2}" fill="none" stroke="var(--text-3)" stroke-width="1.3" stroke-dasharray="${x2 < x1 ? '3 3' : ''}"/><path d="M${x2 - 6} ${y2 - 3.5} L${x2 - 1} ${y2} L${x2 - 6} ${y2 + 3.5}" fill="none" stroke="var(--text-3)" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>`;
        }),
    )
    .join('');
  const left = rows
    .map(r => {
      if (r.type === 'ms') return `<div class="tl-row g">${ic('diamond', 12)}Milestones<span class="faint" style="font-weight:500">${ms.length}</span></div>`;
      if (r.type === 'g')
        return `<div class="tl-row g">${r.G.html || ''}${esc(r.G.name)}<span class="faint" style="font-weight:500">${r.G.tasks.length}</span></div>`;
      const t = r.t;
      return `<div class="tl-row" data-a="openTask" data-id="${t.id}">${stIcon(t.status, 13)}<span class="trunc grow" style="${t.status === 'done' ? 'color:var(--text-3)' : ''}" translate="no">${esc(t.title)}</span>${t.subtasks.length ? `<span class="faint num" style="font-size:11px">${t.subtasks.filter(s => s.done).length}/${t.subtasks.length}</span>` : ''}${av(t.assignee, 'sm')}</div>`;
    })
    .join('');
  if (!rows.length)
    return empty(
      'chart-gantt',
      'Nothing on the timeline',
      'Give tasks a start and due date to see them here.',
      `<button class="btn btn-primary btn-sm" data-a="newTask" ${p ? `data-project="${p.id}"` : ''}>${ic('plus', 14)}New task</button>`,
    );
  const todayX = diffD(TODAY, rs) * dw;
  return `<div class="tl" data-tl-today="${todayX}" data-tl-anchor="${X(S.ui.tlAnchor || iso(TODAY))}" data-tl-key="${key}">
    <div class="tl-left"><div class="tl-head">Task</div><div class="tl-rows" id="tl-rows">${left}<div style="height:40px"></div></div></div>
    <div class="tl-right" id="tl-right" data-keep="tl:${key}:${S.ui.tlZoom}:${S.ui.tlAnchor || ''}">
      <div class="tl-head" style="width:${W}px"><div class="tl-months">${months.map(m => `<div style="width:${m.n * dw}px"><span>${MONL[m.d.getMonth()]} ${m.d.getFullYear()}</span></div>`).join('')}</div><div class="tl-days">${days}</div></div>
      <div class="tl-grid" style="width:${W}px;height:${H + 40}px">
        ${weekend}${glines}
        <div class="tl-today" style="left:${todayX + dw / 2}px" title="Today"></div>
        ${bars}
        <svg class="tl-deps" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">${deps}</svg>
      </div>
    </div>
  </div>`;
}
/* Milestone lane: one diamond per date (same-day milestones merge), and each label may only use
   the room up to the next diamond. Long names are cut with an ellipsis, cramped ones show just the
   diamond; the full name and date are always in the hover tooltip. Labels never overlap. */
export function msLane(ms, X, dw, y) {
  const byDate = {};
  ms.forEach(m => (byDate[m.date] ||= []).push(m));
  const pts = Object.entries(byDate)
    .sort(([a], [b]) => (a > b ? 1 : -1))
    .map(([date, list]) => ({ date, list, x: X(date) + dw / 2 }));
  return pts
    .map((pt, i) => {
      const room = (pts[i + 1] ? pts[i + 1].x : Infinity) - pt.x - 24;
      const first = pt.list[0];
      const name = first.name + (pt.list.length > 1 ? ` +${pt.list.length - 1}` : '');
      const tip = pt.list.map(m => m.name + (m.p ? ` (${m.p.name})` : '')).join(' · ') + ' · ' + fmtDate(pt.date);
      const label = room >= 28 ? `<span class="ms-l" style="max-width:${Number.isFinite(room) ? Math.round(room) + 'px' : 'none'}">${esc(name)}</span>` : '';
      const complete = pt.list.every(milestone => milestone.completed);
      const overdue = !complete && diffD(parse(pt.date), TODAY) < 0;
      const color = complete ? 'var(--green)' : overdue ? 'var(--red)' : first.p ? pColor(first.p) : '';
      const state = complete ? ' · Completed' : overdue ? ' · Overdue' : '';
      return `<div class="ms-w ${complete ? 'done' : overdue ? 'overdue' : ''}" style="left:${pt.x - 6}px;top:${y + 9}px" data-tip="${esc(tip + state)}" tabindex="0" aria-label="Milestone: ${esc(tip + state)}"><span class="ms" style="${color ? `background:${color}` : ''}"></span>${label}</div>`;
    })
    .join('');
}
export function tlAfter() {
  const r = $('#tl-right'),
    l = $('#tl-rows');
  if (!r || !l) return;
  r.onscroll = () => {
    l.scrollTop = r.scrollTop;
  };
  l.scrollTop = r.scrollTop;
  const k = $('.tl').dataset.tlKey + S.ui.tlZoom + (S.ui.tlAnchor || '');
  S.ui.tlInit = S.ui.tlInit || {};
  if (!S.ui.tlInit[k]) {
    S.ui.tlInit[k] = 1;
    r.scrollLeft = Math.max(0, +$('.tl').dataset.tlAnchor - 160);
  }
}
export function pageWsTimeline() {
  const key = 'tl';
  const v = viewOf(key);
  if (!S.ui._tlWsInit) {
    S.ui._tlWsInit = 1;
    S.ui.tlGroup = 'project';
  }
  return `<div class="page flush"><div class="ph"><div><h1>Timeline</h1><p>Schedules, dependencies, and milestones across projects.</p></div></div>
  ${viewToolbar(key, { group: false, sort: false, extra: tlControls(key) })}${timelineHtml(applyView(allTasks(), v), key, null)}</div>`;
}
