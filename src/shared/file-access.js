import { canEditProject } from './project-access.js';

export function canEditFile(file, database, role) {
  return Boolean(
    file &&
    canEditProject(
      database.projects?.find(project => project.id === file.project),
      database.me,
      role,
    ),
  );
}

// Match the server's additional ownership restriction for removing a file.
export function canRemoveFile(file, database, role) {
  return canEditFile(file, database, role) && (role === 'admin' || !file.by || file.by === database.me);
}
