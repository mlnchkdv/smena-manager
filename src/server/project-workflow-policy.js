import { createHash } from 'node:crypto';
import { sameProjectWorkflow } from '../shared/project-workflow.js';
const fail = code => Object.assign(new Error('Use the project workflow configuration endpoint.'), { code, statusCode: 400 });

export const projectWorkflowHash = project =>
  createHash('sha256')
    .update(JSON.stringify(project.workflow || null))
    .digest('hex');
const controlFields = ['workflowRevision', 'workflowUpdatedBy', 'workflowUpdatedAt'];

// Existing processes have a dedicated hash-checked write path. Old clients
// omitting new fields retain canonical configuration; portable/copy provenance
// never becomes proof that someone else configured a new project.
export function preserveProjectWorkflows(current, incoming) {
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return incoming;
  const stored = new Map([
    ...(current.trash || []).filter(item => item.kind === 'project' && item.data?.project).map(item => [item.data.project.id, item.data.project]),
    ...(current.projects || []).map(project => [project.id, project]),
  ]);
  const preserve = project => {
    const result = { ...project },
      before = stored.get(project.id);
    if (before) {
      if (Object.hasOwn(project, 'workflow') && !sameProjectWorkflow(before.workflow, project.workflow)) throw fail('WORKFLOW_ENDPOINT_REQUIRED');
      if (Object.hasOwn(before, 'workflow')) result.workflow = structuredClone(before.workflow);
      else delete result.workflow;
    }
    for (const field of controlFields) {
      if (before && Object.hasOwn(before, field)) result[field] = before[field];
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
