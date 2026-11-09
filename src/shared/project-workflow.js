import { projectAccess, canReadProject } from './project-access.js';
import { workspaceMemberRole } from './workspace-access.js';
import { isActiveMember } from './workspace-membership.js';

// Keep the canonical states used by reports, notifications and milestones.
// A workflow restricts movement between them; it never renames stored states.
export const WORKFLOW_STATES = Object.freeze(['backlog', 'todo', 'progress', 'review', 'done']);
export const WORKFLOW_READY_RULES = Object.freeze(['assignee', 'description', 'due', 'subtasks', 'dependencies']);
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const identity = value => typeof value === 'string' && /^[\p{L}\p{N}_.:@+-]{1,180}$/u.test(value);
const exactKeys = (value, keys) => record(value) && Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key));
const date = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1970-01-01') return false;
  const parsed = new Date(value + 'T00:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};
export function defaultProjectWorkflow() {
  return {
    version: 1,
    transitions: Object.fromEntries(WORKFLOW_STATES.map(state => [state, WORKFLOW_STATES.filter(target => target !== state)])),
    wip: Object.fromEntries(WORKFLOW_STATES.map(state => [state, 0])),
    ready: Object.fromEntries(WORKFLOW_STATES.map(state => [state, Object.fromEntries(WORKFLOW_READY_RULES.map(rule => [rule, false]))])),
    cycles: [],
    activeCycleId: '',
  };
}
export function validProjectWorkflow(value) {
  if (value == null) return true;
  if (
    !exactKeys(value, ['version', 'transitions', 'wip', 'ready', 'cycles', 'activeCycleId']) ||
    value.version !== 1 ||
    !exactKeys(value.transitions, WORKFLOW_STATES) ||
    !exactKeys(value.wip, WORKFLOW_STATES) ||
    !exactKeys(value.ready, WORKFLOW_STATES)
  )
    return false;
  for (const state of WORKFLOW_STATES) {
    const targets = value.transitions[state],
      rules = value.ready[state],
      limit = value.wip[state];
    if (
      !Array.isArray(targets) ||
      new Set(targets).size !== targets.length ||
      targets.some(target => target === state || !WORKFLOW_STATES.includes(target)) ||
      !Number.isInteger(limit) ||
      limit < 0 ||
      limit > 999 ||
      (state === 'done' && limit !== 0) ||
      !exactKeys(rules, WORKFLOW_READY_RULES) ||
      Object.values(rules).some(rule => typeof rule !== 'boolean')
    )
      return false;
  }
  if (
    !Array.isArray(value.cycles) ||
    value.cycles.length > 500 ||
    new Set(value.cycles.map(cycle => cycle?.id)).size !== value.cycles.length ||
    value.cycles.some(
      cycle =>
        !exactKeys(cycle, ['id', 'name', 'start', 'end', 'archived']) ||
        !identity(cycle.id) ||
        typeof cycle.name !== 'string' ||
        !cycle.name.trim() ||
        cycle.name.length > 80 ||
        !date(cycle.start) ||
        !date(cycle.end) ||
        cycle.end < cycle.start ||
        typeof cycle.archived !== 'boolean',
    )
  )
    return false;
  return (
    value.activeCycleId === '' || (typeof value.activeCycleId === 'string' && value.cycles.some(cycle => cycle.id === value.activeCycleId && !cycle.archived))
  );
}

const cycleSignature = cycles => JSON.stringify((cycles || []).map(cycle => [cycle.id, cycle.name, cycle.start, cycle.end, cycle.archived]));
export function sameProjectWorkflow(a, b) {
  if (a == null || b == null) return a == null && b == null;
  if (!validProjectWorkflow(a) || !validProjectWorkflow(b)) return false;
  const signature = value =>
    JSON.stringify([
      value.version,
      value.activeCycleId,
      cycleSignature(value.cycles),
      WORKFLOW_STATES.map(state => [value.transitions[state].slice().sort(), value.wip[state], WORKFLOW_READY_RULES.map(rule => value.ready[state][rule])]),
    ]);
  return signature(a) === signature(b);
}

const standardWorkflow = defaultProjectWorkflow();

// Pure, bounded diagnostics for the complete proposed task set. Bulk swaps are
// evaluated together. Callers must still authorize canonical membership first.
export function projectWorkflowIssues(current, next, { actor, limit = 20 } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new TypeError('Invalid workflow issue limit.');
  const issues = [],
    add = issue => {
      if (issues.length < limit) issues.push(issue);
    };
  const beforeProjects = new Map((current.projects || []).map(project => [project.id, project]));
  const projects = new Map((next.projects || []).map(project => [project.id, project]));
  const beforeTasks = new Map((current.tasks || []).map(task => [task.id, task]));
  const tasks = new Map((next.tasks || []).map(task => [task.id, task]));
  const members = new Map((next.members || []).map(member => [member.id, member]));
  const flows = new Map(),
    changedCycles = new Set(),
    entries = new Map(),
    counts = new Map();
  for (const project of projects.values()) {
    if (!validProjectWorkflow(project.workflow)) {
      add({ code: 'WORKFLOW_INVALID', projectId: project.id });
      continue;
    }
    const before = beforeProjects.get(project.id);
    const changed = !sameProjectWorkflow(before?.workflow, project.workflow);
    if (changed && actor && projectAccess(before || project, actor.memberId, actor.role) < 4) add({ code: 'WORKFLOW_FORBIDDEN', projectId: project.id });
    if (cycleSignature(before?.workflow?.cycles) !== cycleSignature(project.workflow?.cycles) || (before?.workflow == null) !== (project.workflow == null))
      changedCycles.add(project.id);
    flows.set(project.id, project.workflow || standardWorkflow);
  }
  for (const task of tasks.values()) {
    const flow = flows.get(task.project);
    if (!flow) continue;
    const before = beforeTasks.get(task.id),
      state = task.status || 'todo';
    if (!WORKFLOW_STATES.includes(state)) {
      add({ code: 'WORKFLOW_STATE_INVALID', taskId: task.id, projectId: task.project });
      continue;
    }
    const entering = !task.archived && (!before || before.archived || before.project !== task.project || (before.status || 'todo') !== state);
    const cycleChanged = !before || before.project !== task.project || before.cycleId !== task.cycleId || changedCycles.has(task.project);
    if (task.cycleId && cycleChanged) {
      const cycle = flow.cycles.find(cycle => cycle.id === task.cycleId);
      // Archiving a cycle retains prior assignments; assigning new work to it is disallowed.
      if (!cycle || (cycle.archived && (!before || before.project !== task.project || before.cycleId !== task.cycleId)))
        add({ code: 'WORKFLOW_CYCLE_UNAVAILABLE', taskId: task.id, projectId: task.project });
    }
    if (!task.archived) {
      const key = JSON.stringify([task.project, state]);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    if (!entering) continue;
    const key = JSON.stringify([task.project, state]);
    if (!entries.has(key)) entries.set(key, []);
    if (entries.get(key).length < 20) entries.get(key).push(task.id);
    if (before && !before.archived && before.project === task.project && !flow.transitions[before.status || 'todo']?.includes(state))
      add({ code: 'WORKFLOW_TRANSITION', taskId: task.id, projectId: task.project, from: before.status || 'todo', to: state });
    const rules = flow.ready[state],
      missing = [];
    if (rules.assignee) {
      const assignee = members.get(task.assignee);
      if (!isActiveMember(assignee) || !canReadProject(projects.get(task.project), assignee.id, workspaceMemberRole(assignee))) missing.push('assignee');
    }
    if (
      rules.description &&
      !String(task.desc || '')
        .replace(/<[^<>]*>/g, ' ')
        .replace(/&(?:nbsp|#0*160|#x0*a0);/gi, ' ')
        .trim()
    )
      missing.push('description');
    if (rules.due && !date(task.due)) missing.push('due');
    if (rules.subtasks && (task.subtasks || []).some(item => !item.done)) missing.push('subtasks');
    if (
      rules.dependencies &&
      (task.deps || []).some(id => {
        const dependency = tasks.get(id);
        return !dependency || (actor && !canReadProject(projects.get(dependency.project), actor.memberId, actor.role)) || dependency.status !== 'done';
      })
    )
      missing.push('dependencies');
    if (missing.length) add({ code: 'WORKFLOW_READY', taskId: task.id, projectId: task.project, missing });
  }
  for (const [key, taskIds] of entries) {
    const [projectId, state] = JSON.parse(key),
      cap = flows.get(projectId).wip[state],
      count = counts.get(key) || 0;
    if (cap && count > cap) add({ code: 'WORKFLOW_WIP', projectId, state, count, limit: cap, taskIds });
  }
  return issues;
}
