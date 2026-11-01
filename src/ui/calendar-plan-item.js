import { esc } from '../core/utils.js';
import { pColor } from '../core/store.js';
import { ic } from '../core/icons.js';
import { t } from '../core/i18n.js';
export function calendarPlanItem(item, className = 'cev') {
  const type = item.milestone ? 'Milestone' : 'Project deadline';
  return `<button class="${className} calendar-plan-item" style="--c:${pColor(item.p)}" data-a="openCalendarPlan" data-kind="${item.milestone ? 'milestone' : 'deadline'}" data-project="${esc(item.p.id)}" title="${esc(t(type))}: ${esc(item.milestone?.name || item.p.name)}">${ic(item.milestone ? 'diamond' : 'flag', 13)}<span class="trunc" translate="no">${esc(item.milestone?.name || item.p.name)}</span><small>${t(type)}</small></button>`;
}
