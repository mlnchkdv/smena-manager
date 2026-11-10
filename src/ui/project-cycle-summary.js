import { esc, fmtDate } from '../core/utils.js';
import { isRussian, t } from '../core/i18n.js';
import { projectCycleProgress } from '../shared/project-cycle-progress.js';
import { progBar } from './helpers.js';
import '../styles/project-cycles.css';

export function projectCycleSummary(project, tasks) {
  if (!project.workflow?.cycles?.length) return '';
  const word = (en, ru) => (isRussian() ? ru : en);
  const report = projectCycleProgress(project, tasks);
  return `<section class="panel project-cycle-summary" translate="no"><div class="panel-h"><h2>${word('Cycles', 'Циклы')}</h2><button class="btn btn-ghost btn-sm" data-a="openProjectWorkflow" data-id="${esc(project.id)}">${t('Project process')}</button></div><div class="panel-b"><ul class="project-cycle-list">${report.cycles.map(cycle => `<li><button class="project-cycle-title" data-a="goCycleTasks" data-project="${esc(project.id)}" data-id="${esc(cycle.id)}"><strong>${esc(cycle.name)}</strong><span class="hint">${fmtDate(cycle.start, true)} — ${fmtDate(cycle.end, true)}${cycle.id === project.workflow.activeCycleId ? ' · ' + word('active', 'активный') : ''}</span></button><div class="project-cycle-progress">${progBar(Math.round((cycle.completed / Math.max(1, cycle.tasks)) * 100))}<span class="num" title="${word('Completed / total', 'Завершено / всего')}">${cycle.completed}/${cycle.tasks}</span></div></li>`).join('') || `<li class="hint">${word('No active planning cycles.', 'Неархивных циклов пока нет.')}</li>`}</ul><div class="project-cycle-footer"><button class="btn btn-ghost btn-sm" data-a="goCycleTasks" data-project="${esc(project.id)}" data-id="">${word('No cycle', 'Без цикла')} · ${report.unassigned}</button><span class="hint">${word('Showing', 'Показано')} ${report.cycles.length} / ${report.available}</span></div><p class="hint">${word('Historical cycles and counts are in Project process. Dates do not change task deadlines.', 'Архивные циклы и счётчики доступны в процессе проекта. Даты цикла не меняют сроки задач.')}</p>${report.unknown ? `<p class="hint">${word('Some tasks have an unavailable cycle. Open their properties to review it.', 'У некоторых задач недоступный цикл. Проверьте его в свойствах задачи.')}</p>` : ''}</div></section>`;
}
