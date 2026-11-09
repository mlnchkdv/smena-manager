import { runTaskWorkflowCommand } from '../shared/task-workflow-command.js';
import { isRussian, t } from '../core/i18n.js';
import { ST } from '../core/constants.js';
import { workspaceMemberRole } from '../shared/workspace-access.js';

export function run(data, command, readNext) {
  const member = data.members?.find(member => member.id === data.me);
  return runTaskWorkflowCommand(data, command, readNext, { actor: { memberId: data.me, role: workspaceMemberRole(member) } });
}
export function explain(issue) {
  const word = (en, ru) => (isRussian() ? ru : en);
  const state = id => t(ST[id]?.name || id);
  if (issue.code === 'WORKFLOW_TRANSITION')
    return word(
      `This project does not allow ${state(issue.from)} → ${state(issue.to)}.`,
      `Процесс проекта не разрешает переход ${state(issue.from)} → ${state(issue.to)}.`,
    );
  if (issue.code === 'WORKFLOW_WIP')
    return word(
      `${state(issue.state)}: limit ${issue.limit}, proposed ${issue.count}. Move existing work out first.`,
      `${state(issue.state)}: лимит ${issue.limit}, после изменения ${issue.count}. Сначала освободите место.`,
    );
  if (issue.code === 'WORKFLOW_READY') {
    const rules = isRussian()
      ? {
          assignee: 'доступный исполнитель',
          description: 'описание',
          due: 'срок',
          subtasks: 'завершённые подзадачи',
          dependencies: 'завершённые доступные зависимости',
        }
      : {
          assignee: 'an available assignee',
          description: 'a description',
          due: 'a due date',
          subtasks: 'completed subtasks',
          dependencies: 'completed accessible dependencies',
        };
    return word('Before this move, add or complete: ', 'Для перехода нужны: ') + issue.missing.map(rule => rules[rule]).join(', ') + '.';
  }
  if (issue.code === 'WORKFLOW_CYCLE_UNAVAILABLE')
    return word(
      'The cycle is archived or unavailable in this project. Choose an active cycle or no cycle.',
      'Цикл архивирован или недоступен в этом проекте. Выберите действующий цикл или уберите привязку.',
    );
  return word(
    'The task command could not be applied. Workspace data has not been saved.',
    'Не удалось применить команду задачи. Изменения пространства не сохранены.',
  );
}
