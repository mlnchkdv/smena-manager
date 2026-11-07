import { canEditProject } from './project-access.js';

// Intersection is intentional: selected elsewhere is not selected in this result.
export function selectedEditableTasks(ids, selected, database, role = 'viewer') {
  const wanted = new Set(ids.filter(id => selected.has(id)));
  const projects = new Map((database.projects || []).map(project => [project.id, project]));
  return (database.tasks || []).filter(task => wanted.has(task.id) && !task.archived && canEditProject(projects.get(task.project), database.me, role));
}
