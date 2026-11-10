export function projectCycleProgress(project, tasks, limit = 4) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new TypeError('Invalid cycle summary limit.');
  const cycles = project?.workflow?.cycles || [],
    counts = new Map(cycles.map(cycle => [cycle.id, { tasks: 0, completed: 0 }]));
  let unassigned = 0,
    unknown = 0,
    total = 0;
  for (const task of tasks || []) {
    if (task.project !== project.id || task.archived) continue;
    total++;
    if (!task.cycleId) {
      unassigned++;
      continue;
    }
    const count = counts.get(task.cycleId);
    if (!count) {
      unknown++;
      continue;
    }
    count.tasks++;
    if (task.status === 'done') count.completed++;
  }
  const available = cycles.filter(cycle => !cycle.archived);
  const rows = available
    .slice()
    .sort((a, b) => Number(b.id === project.workflow.activeCycleId) - Number(a.id === project.workflow.activeCycleId) || b.end.localeCompare(a.end))
    .slice(0, limit)
    .map(cycle => ({ ...cycle, ...counts.get(cycle.id) }));
  return { cycles: rows, available: available.length, total, unassigned, unknown };
}
