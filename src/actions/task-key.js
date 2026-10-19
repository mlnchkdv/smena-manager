/** Allocate the next human-readable task key within a project. */
export function nextTaskKey(project) {
  project.seq = (project.seq || 200) + 1;
  return `${project.key}-${project.seq}`;
}
