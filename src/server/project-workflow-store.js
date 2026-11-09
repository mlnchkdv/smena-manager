import { projectWorkflowHash } from './project-workflow-policy.js';
import { getWorkspaceDatabase, mutateWorkspaceMetadata } from './workspace-store.js';
import { knowledgeActor } from './knowledge-access.js';
import { projectAccess } from '../shared/project-access.js';
import { workspaceMemberRole } from '../shared/workspace-access.js';
import { defaultProjectWorkflow, validProjectWorkflow, sameProjectWorkflow, projectWorkflowIssues } from '../shared/project-workflow.js';

const fail = (code, statusCode = 400) => Object.assign(new Error('Project workflow could not be saved.'), { code, statusCode });
function context(data, id, profile, profiles, write = false) {
  const actor = knowledgeActor(data, profile, profiles, { write }),
    project = data.projects.find(project => project.id === id);
  const access = projectAccess(project, actor.id, workspaceMemberRole(actor));
  if (!access) throw fail('PROJECT_NOT_FOUND', 404);
  if (write && (project.archived || access < 4)) throw fail('WORKFLOW_FORBIDDEN', 403);
  if (!validProjectWorkflow(project.workflow)) throw fail('WORKFLOW_INTEGRITY', 503);
  if (
    project.workflowRevision != null &&
    (!Number.isSafeInteger(project.workflowRevision) || project.workflowRevision < 0 || project.workflowRevision > 1000000)
  )
    throw fail('WORKFLOW_INTEGRITY', 503);
  return { actor, project, access };
}
function model(data, selected) {
  const { actor, project, access } = selected,
    tasks = data.tasks.filter(task => task.project === project.id && !task.archived);
  const workflow = project.workflow || defaultProjectWorkflow();
  const counts = Object.fromEntries(Object.keys(workflow.transitions).map(state => [state, 0]));
  const cycleCounts = new Map(workflow.cycles.map(cycle => [cycle.id, { id: cycle.id, tasks: 0, completed: 0 }]));
  for (const task of tasks) {
    if (Object.hasOwn(counts, task.status)) counts[task.status]++;
    const cycle = cycleCounts.get(task.cycleId);
    if (cycle) {
      cycle.tasks++;
      if (task.status === 'done') cycle.completed++;
    }
  }
  return {
    projectId: project.id,
    name: project.name,
    actor: actor.id,
    canConfigure: !project.archived && access >= 4,
    workflow,
    workflowHash: projectWorkflowHash(project),
    revision: project.workflowRevision || 0,
    updatedBy: project.workflowUpdatedBy || '',
    updatedAt: project.workflowUpdatedAt || '',
    counts,
    cycles: [...cycleCounts.values()],
  };
}
export async function readProjectWorkflow(id, profile, profiles = []) {
  const data = await getWorkspaceDatabase({ fields: ['members', 'projects', 'tasks'] });
  return model(data, context(data, id, profile, profiles));
}
export async function writeProjectWorkflow(id, input, profile, profiles = []) {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).some(key => !['workflow', 'workflowHash'].includes(key)) ||
    !Object.hasOwn(input, 'workflow') ||
    !validProjectWorkflow(input.workflow) ||
    typeof input.workflowHash !== 'string' ||
    !/^[a-f0-9]{64}$/.test(input.workflowHash)
  )
    throw fail('WORKFLOW_INVALID');
  for (let attempt = 0; attempt < 3; attempt++) {
    const baseline = await getWorkspaceDatabase({ fields: ['revision'] });
    try {
      const saved = await mutateWorkspaceMetadata(
        data => {
          const selected = context(data, id, profile, profiles, true),
            { project, actor } = selected;
          if (sameProjectWorkflow(project.workflow, input.workflow))
            throw Object.assign(new Error('Workflow already matches.'), { code: 'WORKFLOW_REPLAY_OK', result: model(data, selected) });
          if (projectWorkflowHash(project) !== input.workflowHash) throw fail('WORKFLOW_STALE', 409);
          if ((project.workflowRevision || 0) >= 1000000) throw fail('WORKFLOW_LIMIT', 409);
          const before = { ...data, projects: data.projects.map(project => ({ ...project })) };
          project.workflow = structuredClone(input.workflow);
          const issues = projectWorkflowIssues(before, data, { actor: { memberId: actor.id, role: workspaceMemberRole(actor) } });
          if (issues.length) throw fail(issues[0].code);
          project.workflowRevision = Number(project.workflowRevision || 0) + 1;
          project.workflowUpdatedBy = actor.id;
          project.workflowUpdatedAt = new Date().toISOString();
          return data;
        },
        baseline.revision,
        { role: 'admin', scope: 'workflow' },
      );
      return model(saved, context(saved, id, profile, profiles));
    } catch (error) {
      if (error.code === 'WORKFLOW_REPLAY_OK') return error.result;
      if (error.code !== 'REVISION_CONFLICT' || attempt === 2) throw error;
    }
  }
}
