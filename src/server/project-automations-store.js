import { getWorkspaceDatabase, mutateWorkspaceMetadata } from './workspace-store.js';
import { knowledgeActor } from './knowledge-access.js';
import { projectAccess } from '../shared/project-access.js';
import { workspaceMemberRole } from '../shared/workspace-access.js';
import { validProjectAutomations, planProjectAutomations, AUTOMATION_LIMITS } from '../shared/project-automations.js';
import { validateTaskTransitions } from './task-integrity.js';
import { projectAutomationProgram, projectAutomationsHash, validateStoredProjectAutomations } from './project-automations-policy.js';
import { validateAutomationTargets } from './project-automations-execution.js';

const fail = (code, statusCode = 400) => Object.assign(new Error('The project automation operation is unavailable.'), { code, statusCode });
const fields = ['revision', 'members', 'projects', 'tasks'];
const exact = (value, keys) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).length === keys.length &&
  Object.keys(value).every(key => keys.includes(key));
function context(data, id, profile, profiles, level = 1) {
  const actor = knowledgeActor(data, profile, profiles, { write: level >= 3 }),
    project = data.projects.find(project => project.id === id);
  const access = projectAccess(project, actor.id, workspaceMemberRole(actor));
  if (!access) throw fail('PROJECT_NOT_FOUND', 404);
  if (access < level || (level >= 3 && project.archived)) throw fail('AUTOMATION_FORBIDDEN', 403);
  validateStoredProjectAutomations({ projects: [project] });
  return { actor, project, access };
}
function model(selected) {
  const { actor, project, access } = selected;
  return {
    projectId: project.id,
    name: typeof project.name === 'string' ? project.name.slice(0, 300) : '',
    actor: actor.id,
    canConfigure: !project.archived && access >= 4,
    canPreview: !project.archived && access >= 3,
    executionAvailable: true,
    history: project.automationHistory || [],
    program: projectAutomationProgram(project),
    programHash: projectAutomationsHash(project),
    revision: project.automationsRevision || 0,
    updatedBy: project.automationsUpdatedBy || '',
    updatedAt: project.automationsUpdatedAt || '',
  };
}
export async function readProjectAutomations(id, profile, profiles = []) {
  const data = await getWorkspaceDatabase({ fields: ['members', 'projects'] });
  return model(context(data, id, profile, profiles));
}
export async function writeProjectAutomations(id, input, profile, profiles = []) {
  if (
    !exact(input, ['program', 'programHash']) ||
    !validProjectAutomations(input.program) ||
    typeof input.programHash !== 'string' ||
    !/^[a-f0-9]{64}$/.test(input.programHash)
  )
    throw fail('AUTOMATION_INVALID');
  for (let attempt = 0; attempt < 3; attempt++) {
    const baseline = await getWorkspaceDatabase({ fields: ['revision'] });
    try {
      const saved = await mutateWorkspaceMetadata(
        data => {
          const selected = context(data, id, profile, profiles, 4),
            { project, actor } = selected;
          validateAutomationTargets(data, project, input.program);
          const target = { automations: input.program };
          if (projectAutomationsHash(project) === projectAutomationsHash(target))
            throw Object.assign(new Error('Automation settings already match.'), { code: 'AUTOMATION_REPLAY_OK', result: model(selected) });
          if (projectAutomationsHash(project) !== input.programHash) throw fail('AUTOMATION_STALE', 409);
          if ((project.automationsRevision || 0) >= 1_000_000) throw fail('AUTOMATION_LIMIT', 409);
          project.automations = structuredClone(input.program);
          project.automationsRevision = Number(project.automationsRevision || 0) + 1;
          project.automationsUpdatedBy = actor.id;
          project.automationsUpdatedAt = new Date().toISOString();
          return data;
        },
        baseline.revision,
        { role: 'admin', scope: 'automations' },
      );
      return model(context(saved, id, profile, profiles));
    } catch (error) {
      if (error.code === 'AUTOMATION_REPLAY_OK') return error.result;
      if (error.code !== 'REVISION_CONFLICT' || attempt === 2) throw error;
    }
  }
}

export async function previewProjectAutomations(id, input, profile, profiles = []) {
  if (
    !exact(input, ['program', 'transitions']) ||
    !validProjectAutomations(input.program) ||
    !Array.isArray(input.transitions) ||
    !input.transitions.length ||
    input.transitions.length > AUTOMATION_LIMITS.events ||
    new Set(input.transitions.map(change => change?.taskId)).size !== input.transitions.length ||
    input.transitions.some(
      change =>
        !exact(change, ['taskId', 'to']) ||
        typeof change.taskId !== 'string' ||
        !/^[\p{L}\p{N}_.:@+-]{1,180}$/u.test(change.taskId) ||
        !['backlog', 'todo', 'progress', 'review', 'done'].includes(change.to),
    )
  )
    throw fail('AUTOMATION_PREVIEW_INVALID');
  const data = await getWorkspaceDatabase({ fields }),
    selected = context(data, id, profile, profiles, 3);
  const changes = new Map(input.transitions.map(change => [change.taskId, change.to]));
  if (input.transitions.some(change => !data.tasks.some(task => task.id === change.taskId && task.project === id && !task.archived)))
    throw fail('AUTOMATION_TASK_NOT_FOUND', 404);
  const proposed = { ...data, tasks: data.tasks.map(task => (changes.has(task.id) ? { ...task, status: changes.get(task.id) } : task)) };
  const actor = { memberId: selected.actor.id, role: workspaceMemberRole(selected.actor) };
  // Simulate a permitted user transition first, then the assignment result.
  // This does not silently let automation bypass readiness/WIP conditions.
  validateTaskTransitions(data, proposed, actor);
  const result = planProjectAutomations(data, proposed, id, input.program, { actorId: selected.actor.id, inspectDisabled: true });
  if (!result.blocked) {
    const patches = new Map(result.changes.map(change => [change.taskId, Object.fromEntries(change.fields.map(field => [field.field, field.to]))]));
    const after = { ...proposed, tasks: proposed.tasks.map(task => (patches.has(task.id) ? { ...task, ...patches.get(task.id) } : task)) };
    try {
      validateTaskTransitions(data, after, actor);
    } catch (error) {
      result.blocked = true;
      result.changes = [];
      result.issueCount++;
      result.issues.push({ code: 'AUTOMATION_CANONICAL_VALIDATION', cause: error.code || 'TASK_INVALID' });
    }
  }
  return { ...result, canExecute: false };
}
