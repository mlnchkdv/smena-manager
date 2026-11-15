export const PROJECT_STATUS_IDS = ['planning', 'active', 'risk', 'hold', 'complete'];
export const validProjectStatus = value => PROJECT_STATUS_IDS.includes(value);

// Preserve an unrecognised legacy value while allowing the workspace to open.
// New writes are validated separately and cannot introduce unknown statuses.
export function migrateProjectStatuses(data) {
  for (const project of data.projects || []) {
    if (project.status != null && !validProjectStatus(project.status)) {
      project.legacyStatus = String(project.status).slice(0, 180);
      project.status = 'planning';
    }
  }
  return data;
}
