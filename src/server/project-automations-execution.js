import { createHash } from 'node:crypto';
import { planProjectAutomations, AUTOMATION_LIMITS } from '../shared/project-automations.js';
import { canEditProject, canReadProject } from '../shared/project-access.js';
import { workspaceMemberRole } from '../shared/workspace-access.js';
import { isActiveMember } from '../shared/workspace-membership.js';
import { validateTaskTransitions } from './task-integrity.js';
import { projectAutomationProgram, projectAutomationsHash } from './project-automations-policy.js';
import { appendAutomationRuns, AUTOMATION_HISTORY_LIMITS } from './project-automation-history.js';

const fail = (code, statusCode = 400) => Object.assign(new Error('Project rules prevented this task change.'), { code, statusCode });
export function validateAutomationTargets(data, project, program) {
  const members = new Map(data.members.map(member => [member.id, member]));
  const rules = program.rules.filter(rule => rule.enabled);
  for (const rule of rules) {
    for (const action of rule.actions) {
      if (action.field === 'assignee' && action.value) {
        const member = members.get(action.value);
        if (!isActiveMember(member) || !canReadProject(project, member.id, workspaceMemberRole(member))) throw fail('AUTOMATION_ASSIGNEE_UNAVAILABLE');
      }
      if (action.field === 'cycleId' && action.value && !project.workflow?.cycles?.some(cycle => cycle.id === action.value && !cycle.archived))
        throw fail('AUTOMATION_CYCLE_UNAVAILABLE');
    }
    for (const other of rules) {
      if (other.id === rule.id || other.trigger.to !== rule.trigger.to || !rule.trigger.from.some(state => other.trigger.from.includes(state))) continue;
      if (rule.actions.some(action => other.actions.some(candidate => action.field === candidate.field && action.value !== candidate.value)))
        throw fail('AUTOMATION_ACTION_CONFLICT');
    }
  }
}

// Called only inside the existing canonical write lock, after validating the
// user's own transition. No scheduling, network, external messages or status
// actions. A save, its notification events and these receipts share one CAS.
export function executeProjectAutomations(current, candidate, actorId) {
  if (!actorId) return candidate;
  const before = new Map(current.tasks.map(task => [task.id, task])),
    groups = new Map();
  for (const task of candidate.tasks) {
    const old = before.get(task.id);
    if (task.archived || (old && (old.archived || old.project !== task.project || (old.status || 'todo') === (task.status || 'todo')))) continue;
    if (!groups.has(task.project)) groups.set(task.project, []);
    groups.get(task.project).push(task);
  }
  if (!groups.size) return candidate;
  const previousProjects = new Map(current.projects.map(project => [project.id, project]));
  const nextProjects = new Map(candidate.projects.map(project => [project.id, project]));
  const changes = new Map(),
    receipts = new Map();
  let events = 0,
    operations = 0;
  for (const [id, tasks] of groups) {
    const project = previousProjects.get(id),
      nextProject = nextProjects.get(id);
    if (!project || project.archived || !nextProject || nextProject.archived) continue;
    const program = projectAutomationProgram(project);
    if (!program.rules.some(rule => rule.enabled)) continue;
    const actors = [current, candidate].map(data => data.members.find(member => member.id === actorId));
    if (actors.some((actor, index) => !isActiveMember(actor) || !canEditProject(index ? nextProject : project, actorId, workspaceMemberRole(actor))))
      throw fail('AUTOMATION_FORBIDDEN', 403);
    const hash = projectAutomationsHash(project);
    if (hash !== projectAutomationsHash(nextProject)) throw fail('AUTOMATION_STALE');
    const initial = {
      revision: current.revision,
      members: current.members,
      projects: [project],
      tasks: tasks.map(task => before.get(task.id)).filter(Boolean),
    };
    const proposed = { members: candidate.members, projects: [nextProject], tasks };
    const plan = planProjectAutomations(initial, proposed, id, program, { actorId, maxOperations: Math.max(1, AUTOMATION_LIMITS.operations - operations) });
    if (plan.blocked) throw fail(plan.issues[0]?.code || 'AUTOMATION_BLOCKED');
    events += plan.triggeredTasks;
    operations += plan.proposedOperations;
    if (events > AUTOMATION_LIMITS.events) throw fail('AUTOMATION_EVENT_LIMIT');
    if (operations > AUTOMATION_LIMITS.operations) throw fail('AUTOMATION_OPERATION_LIMIT');
    if (!plan.triggeredTasks) continue;
    const matched = tasks
      .filter(task =>
        program.rules.some(
          rule =>
            rule.enabled &&
            rule.trigger.to === (task.status || 'todo') &&
            rule.trigger.from.includes(before.has(task.id) ? before.get(task.id).status || 'todo' : 'created'),
        ),
      )
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const eventIdentity = matched.map(task => [task.id, before.has(task.id) ? before.get(task.id).status || 'todo' : 'created', task.status || 'todo']);
    const runId = createHash('sha256')
      .update(JSON.stringify([1, current.ws?.id || current.ws?.url || 'default', id, hash, actorId, current.revision, eventIdentity]))
      .digest('hex');
    receipts.set(id, {
      id: runId,
      programHash: hash,
      actorId,
      sourceRevision: current.revision,
      revision: current.revision + 1,
      at: new Date().toISOString(),
      matchedTasks: plan.triggeredTasks,
      assignments: plan.proposedOperations,
      noops: plan.noops,
      tasks: matched.slice(0, AUTOMATION_HISTORY_LIMITS.taskSamples).map(task => task.id),
    });
    for (const change of plan.changes) changes.set(change.taskId, Object.fromEntries(change.fields.map(field => [field.field, field.to])));
  }
  if (!receipts.size) return candidate;
  const next = { ...candidate, tasks: candidate.tasks.map(task => (changes.has(task.id) ? { ...task, ...changes.get(task.id) } : task)) };
  const actor = candidate.members.find(member => member.id === actorId);
  validateTaskTransitions(current, next, { memberId: actorId, role: workspaceMemberRole(actor) });
  return appendAutomationRuns(next, receipts);
}
