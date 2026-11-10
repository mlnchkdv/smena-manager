import { createHash } from 'node:crypto';
import { defaultProjectAutomations, validProjectAutomations, projectAutomationsSignature } from '../shared/project-automations.js';

export const PROJECT_AUTOMATION_FIELDS = Object.freeze(['automations', 'automationsRevision', 'automationsUpdatedBy', 'automationsUpdatedAt']);
export const projectAutomationProgram = project => project.automations ?? defaultProjectAutomations();
export const projectAutomationsHash = project =>
  createHash('sha256')
    .update(projectAutomationsSignature(projectAutomationProgram(project)))
    .digest('hex');
const identity = value => typeof value === 'string' && /^[\p{L}\p{N}_.:@+-]{1,180}$/u.test(value);
const integrity = () =>
  Object.assign(new TypeError('The stored project automation configuration is invalid.'), { code: 'AUTOMATION_INTEGRITY', statusCode: 503 });

export function validateStoredProjectAutomations(data) {
  for (const project of [
    ...(data.projects || []),
    ...(data.trash || [])
      .filter(item => item.kind === 'project')
      .map(item => item.data?.project)
      .filter(Boolean),
  ]) {
    if (project.automations != null && !validProjectAutomations(project.automations)) throw integrity();
    if (
      project.automationsRevision != null &&
      (!Number.isSafeInteger(project.automationsRevision) || project.automationsRevision < 0 || project.automationsRevision > 1_000_000)
    )
      throw integrity();
    if (project.automationsUpdatedBy != null && !identity(project.automationsUpdatedBy)) throw integrity();
    if (
      project.automationsUpdatedAt != null &&
      (typeof project.automationsUpdatedAt !== 'string' ||
        project.automationsUpdatedAt.length > 40 ||
        !Number.isFinite(Date.parse(project.automationsUpdatedAt)))
    )
      throw integrity();
  }
  return data;
}

// Snapshot clients retain canonical configuration, including when an old
// client omits it. New/copy provenance cannot configure executable rules.
export function preserveProjectAutomations(current, incoming) {
  const stored = new Map([
    ...(current.trash || []).filter(item => item.kind === 'project' && item.data?.project).map(item => [item.data.project.id, item.data.project]),
    ...(current.projects || []).map(project => [project.id, project]),
  ]);
  const preserve = project => {
    const result = { ...project },
      before = stored.get(project.id);
    if (before && Object.hasOwn(project, 'automations')) {
      if (!validProjectAutomations(projectAutomationProgram(project)) || projectAutomationsHash(before) !== projectAutomationsHash(project))
        throw Object.assign(new Error('Use the canonical project automation settings endpoint.'), { code: 'AUTOMATION_ENDPOINT_REQUIRED', statusCode: 400 });
    }
    for (const field of PROJECT_AUTOMATION_FIELDS) {
      if (before && Object.hasOwn(before, field)) result[field] = structuredClone(before[field]);
      else delete result[field];
    }
    return result;
  };
  return {
    ...incoming,
    ...(Array.isArray(incoming.projects) ? { projects: incoming.projects.map(preserve) } : {}),
    ...(Array.isArray(incoming.trash)
      ? {
          trash: incoming.trash.map(item =>
            item.kind === 'project' && item.data?.project ? { ...item, data: { ...item.data, project: preserve(item.data.project) } } : item,
          ),
        }
      : {}),
  };
}
