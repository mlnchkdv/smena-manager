const LEVELS = { 'Can view': 1, 'Can comment': 2, 'Can edit': 3, 'Full access': 4 };

export function projectAccess(project, memberId, role = 'editor') {
  if (!project) return 0;
  if (role === 'admin') return 4;
  const invited = project.lead === memberId || project.members?.includes(memberId);
  const privateProject = project.access ? project.access === 'private' : project.private === true;
  if (privateProject && !invited) return 0;
  const level = project.lead === memberId ? 4 : invited && project.perms?.[memberId] ? LEVELS[project.perms[memberId]] || 1 : 3;
  return role === 'viewer' ? Math.min(level, 1) : level;
}

export const canReadProject = (project, memberId, role) => projectAccess(project, memberId, role) >= 1;
export const canEditProject = (project, memberId, role) => projectAccess(project, memberId, role) >= 3;

export function entityProjectId(entity, database) {
  return entity?.project || (entity?.task && database.tasks?.find(task => task.id === entity.task)?.project) || null;
}

export function trashProject(item) {
  return item?.data?.project || null;
}

export function trashProjectId(item) {
  return item?.data?.project?.id || item?.data?.task?.project || item?.data?.file?.project || null;
}
