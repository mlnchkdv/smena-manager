import { D, S, proj } from '../core/store.js';
import { esc } from '../core/utils.js';
import { isRussian } from '../core/i18n.js';
import { canEditProject } from '../shared/project-access.js';
import { taskCycleChoices } from '../shared/task-cycles.js';

export function taskCycleControl(task, form = false) {
  const project = proj(task.project),
    selected = task.cycleId || '',
    cycles = taskCycleChoices(project, selected);
  if (!cycles.length && !selected) return '';
  const word = (en, ru) => (isRussian() ? ru : en);
  const disabled = project?.archived || !canEditProject(project, D().me, S.ui.currentUser?.role || 'viewer');
  const options = [`<option value="" ${!selected ? 'selected' : ''}>${word('No cycle', 'Без цикла')}</option>`];
  if (selected && !cycles.some(cycle => cycle.id === selected))
    options.push(`<option value="${esc(selected)}" selected disabled>${word('Unavailable cycle', 'Недоступный цикл')}</option>`);
  options.push(
    ...cycles.map(
      cycle =>
        `<option value="${esc(cycle.id)}" ${cycle.id === selected ? 'selected' : ''} ${cycle.archived ? 'disabled' : ''}>${esc(cycle.name)}${cycle.archived ? word(' (archived)', ' (архив)') : cycle.id === project.workflow.activeCycleId ? word(' (active)', ' (активный)') : ''}</option>`,
    ),
  );
  return `<select class="select" id="${form ? 'f' : 'd'}-cycle" data-in="taskCycle" data-id="${form ? '__form' : esc(task.id)}" aria-label="${word('Cycle', 'Цикл')}" translate="no" ${disabled ? 'disabled' : ''}>${options.join('')}</select>`;
}
