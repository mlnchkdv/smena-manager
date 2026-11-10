// Project-scoped identities prevent equal cycle IDs/names in other projects
// from matching the same saved filter. Each component is encoded separately.
export const taskCycleValue = (projectId, cycleId = '') => `${encodeURIComponent(projectId)}:${encodeURIComponent(cycleId || '')}`;
export const matchesTaskCycle = (task, values) => values.includes(taskCycleValue(task.project, task.cycleId));
// A single writable inclusion is an explicit creation context. Historical,
// ambiguous or foreign filters must never assign work to an unavailable cycle.
export function filteredTaskCycle(project, filters = []) {
  const rules = filters.filter(filter => filter.f === 'cycleId' && filter.v?.length);
  const inclusion = rules.find(filter => filter.op !== 'not' && filter.v.length === 1);
  if (!project || !inclusion) return undefined;
  const choices = ['', ...(project.workflow?.cycles || []).filter(cycle => !cycle.archived).map(cycle => cycle.id)];
  return choices.find(cycleId => {
    const task = { project: project.id, cycleId };
    return inclusion.v[0] === taskCycleValue(project.id, cycleId) && rules.every(rule => matchesTaskCycle(task, rule.v) !== (rule.op === 'not'));
  });
}
export function newTaskCycle(project, requested) {
  if (requested !== undefined) return requested || '';
  return project?.workflow?.cycles?.some(cycle => cycle.id === project.workflow.activeCycleId && !cycle.archived) ? project.workflow.activeCycleId : '';
}
export function copiedTaskCycle(project, currentId) {
  if (!currentId) return '';
  return project?.workflow?.cycles?.some(cycle => cycle.id === currentId && !cycle.archived) ? currentId : newTaskCycle(project);
}
export function taskCycleChoices(project, currentId, { includeArchived = false } = {}) {
  return (project?.workflow?.cycles || []).filter(cycle => includeArchived || !cycle.archived || cycle.id === currentId);
}
export function taskCycleProject(tasks, projects) {
  const id = tasks[0]?.project;
  return id && tasks.every(task => task.project === id) ? projects.find(project => project.id === id) || null : null;
}
