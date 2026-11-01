// Both the calendar cells and their overflow list must use the same scoped inputs.
export function calendarDayItems(tasks, events, date, projectId = '', options = {}) {
  const layers = Number.isInteger(options.layers) ? options.layers : 3;
  const projects = (options.projects || []).filter(project => !projectId || project.id === projectId);
  const allowed = options.projects ? new Set(projects.map(p => p.id)) : null;
  const inDay = item => (!projectId || item.project === projectId) && (!allowed || allowed.has(item.project));
  return [
    ...(layers & 2 ? events.filter(event => event.date === date && inDay(event)).map(ev => ({ ev })) : []),
    ...(layers & 1 ? tasks.filter(task => task.due === date && inDay(task)).map(t => ({ t })) : []),
    ...(layers & 4 ? projects.flatMap(p => (p.milestones || []).filter(m => m.date === date).map(milestone => ({ milestone, p }))) : []),
    ...(layers & 8 ? projects.filter(p => p.due === date).map(p => ({ deadline: true, p })) : []),
  ];
}
