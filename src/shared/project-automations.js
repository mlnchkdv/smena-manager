import { canReadProject } from './project-access.js';
import { workspaceMemberRole } from './workspace-access.js';
import { isActiveMember } from './workspace-membership.js';
import { WORKFLOW_STATES } from './project-workflow.js';

// Planning only: this module does not write, enqueue, send or schedule anything.
// A future executor must recheck canonical membership, workflow and revision,
// and persist its idempotency receipt atomically with the task changes.
export const AUTOMATION_LIMITS = Object.freeze({ rules: 20, events: 100, operations: 200, issues: 20, previewBytes: 256 * 1024 });
const fields = ['priority', 'assignee', 'cycleId'];
const priorities = ['none', 'low', 'medium', 'high', 'urgent'];
const sources = ['created', ...WORKFLOW_STATES];
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const identity = value => typeof value === 'string' && /^[\p{L}\p{N}_.:@+-]{1,180}$/u.test(value);
const exact = (value, keys) => record(value) && Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key));
const order = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const fail = (code, statusCode = 400) => Object.assign(new TypeError('The automation preview is unavailable.'), { code, statusCode });

export const defaultProjectAutomations = () => ({ version: 1, rules: [] });

export function validProjectAutomations(program) {
  return !!(
    exact(program, ['version', 'rules']) &&
    program.version === 1 &&
    Array.isArray(program.rules) &&
    program.rules.length <= AUTOMATION_LIMITS.rules &&
    new Set(program.rules.map(rule => rule?.id)).size === program.rules.length &&
    program.rules.every(
      rule =>
        exact(rule, ['id', 'name', 'enabled', 'trigger', 'actions']) &&
        identity(rule.id) &&
        typeof rule.name === 'string' &&
        rule.name.trim() &&
        rule.name.length <= 80 &&
        typeof rule.enabled === 'boolean' &&
        exact(rule.trigger, ['from', 'to']) &&
        WORKFLOW_STATES.includes(rule.trigger.to) &&
        Array.isArray(rule.trigger.from) &&
        rule.trigger.from.length > 0 &&
        rule.trigger.from.length <= WORKFLOW_STATES.length &&
        new Set(rule.trigger.from).size === rule.trigger.from.length &&
        rule.trigger.from.every(source => sources.includes(source) && source !== rule.trigger.to) &&
        Array.isArray(rule.actions) &&
        rule.actions.length > 0 &&
        rule.actions.length <= fields.length &&
        new Set(rule.actions.map(action => action?.field)).size === rule.actions.length &&
        rule.actions.every(
          action =>
            exact(action, ['field', 'value']) &&
            fields.includes(action.field) &&
            (action.field === 'priority'
              ? priorities.includes(action.value)
              : action.field === 'assignee'
                ? action.value === null || identity(action.value)
                : action.value === '' || identity(action.value)),
        ),
    )
  );
}

// Stable across JSON property and rule/action ordering, without locale sorting.
// This is canonical input for hashing, not a signed review token or a receipt.
export function projectAutomationsSignature(program) {
  if (!validProjectAutomations(program)) throw fail('AUTOMATION_INVALID');
  return JSON.stringify([
    1,
    program.rules
      .slice()
      .sort((a, b) => order(a.id, b.id))
      .map(rule => [
        rule.id,
        rule.name,
        rule.enabled,
        rule.trigger.from.slice().sort(order),
        rule.trigger.to,
        rule.actions
          .slice()
          .sort((a, b) => order(a.field, b.field))
          .map(action => [action.field, action.value]),
      ]),
  ]);
}

export function automationEventKey(projectId, ruleId, event, revision) {
  if (
    ![projectId, ruleId, event?.taskId].every(identity) ||
    !sources.includes(event?.from) ||
    !WORKFLOW_STATES.includes(event?.to) ||
    event.from === event.to ||
    !Number.isSafeInteger(revision) ||
    revision < 0
  )
    throw fail('AUTOMATION_EVENT_INVALID');
  return JSON.stringify([1, projectId, ruleId, event.taskId, event.from, event.to, revision]);
}

function identityIndex(items) {
  const map = new Map();
  for (const item of items) {
    if (!record(item) || !identity(item.id) || map.has(item.id)) throw fail('AUTOMATION_CONTEXT_INVALID');
    map.set(item.id, item);
  }
  return map;
}

function context(current, next, projectId, actorId) {
  if (
    !identity(projectId) ||
    ![current, next].every(data => record(data) && ['projects', 'members', 'tasks'].every(key => Array.isArray(data[key]))) ||
    !Number.isSafeInteger(current.revision) ||
    current.revision < 0
  )
    throw fail('AUTOMATION_CONTEXT_INVALID');
  let project, members;
  for (const data of [current, next]) {
    members = identityIndex(data.members);
    const actor = members.get(actorId);
    project = identityIndex(data.projects).get(projectId);
    if (!identity(actorId) || !isActiveMember(actor) || !canReadProject(project, actorId, workspaceMemberRole(actor))) throw fail('AUTOMATION_NOT_FOUND', 404);
    if (project.archived) throw fail('AUTOMATION_PROJECT_ARCHIVED', 409);
  }
  return { project, members };
}

function currentValue(task, field) {
  const value = task[field];
  if (field === 'priority') return priorities.includes(value ?? 'none') ? (value ?? 'none') : invalidValue;
  if (value == null || value === '') return field === 'assignee' ? null : '';
  return identity(value) ? value : invalidValue;
}
const invalidValue = Symbol('invalid');

export function planProjectAutomations(current, next, projectId, program, options = {}) {
  if (!record(options) || Object.keys(options).some(key => !['actorId', 'inspectDisabled', 'maxOperations'].includes(key)))
    throw fail('AUTOMATION_OPTIONS_INVALID');
  const { actorId, inspectDisabled = false, maxOperations = AUTOMATION_LIMITS.operations } = options;
  const { project, members } = context(current, next, projectId, actorId);
  if (typeof inspectDisabled !== 'boolean' || !Number.isInteger(maxOperations) || maxOperations < 1 || maxOperations > AUTOMATION_LIMITS.operations)
    throw fail('AUTOMATION_OPTIONS_INVALID');
  const signature = projectAutomationsSignature(program);
  const rules = program.rules
    .filter(rule => rule.enabled || inspectDisabled)
    .slice()
    .sort((a, b) => order(a.id, b.id));
  const result = {
    version: 1,
    mode: 'preview',
    executionEnabled: false,
    requiresCanonicalValidation: true,
    complete: true,
    projectId,
    revision: current.revision,
    signature,
    triggeredTasks: 0,
    proposedOperations: 0,
    appliedOperations: 0,
    noops: 0,
    issueCount: 0,
    issuesTruncated: false,
    changes: [],
    issues: [],
    blocked: false,
  };
  if (!rules.length) return result;
  const before = identityIndex(current.tasks),
    after = identityIndex(next.tasks);
  const events = [];
  let totalEvents = 0;
  for (const task of after.values()) {
    if (task.project !== projectId || task.archived) continue;
    const old = before.get(task.id);
    // A restore or a project move is not a creation/status-change trigger.
    if (old && (old.archived || old.project !== projectId)) continue;
    const from = old ? old.status || 'todo' : 'created',
      to = task.status || 'todo';
    if (!sources.includes(from) || !WORKFLOW_STATES.includes(to)) throw fail('AUTOMATION_CONTEXT_INVALID');
    if (from === to || !rules.some(rule => rule.trigger.to === to && rule.trigger.from.includes(from))) continue;
    totalEvents++;
    if (events.length < AUTOMATION_LIMITS.events) events.push({ taskId: task.id, from, to });
  }
  result.triggeredTasks = totalEvents;
  const issue = value => {
    result.issueCount++;
    if (result.issues.length < AUTOMATION_LIMITS.issues) result.issues.push(value);
    result.issuesTruncated = result.issueCount > result.issues.length;
    result.blocked = true;
  };
  if (totalEvents > AUTOMATION_LIMITS.events) {
    result.complete = false;
    issue({ code: 'AUTOMATION_EVENT_LIMIT', limit: AUTOMATION_LIMITS.events });
    return result;
  }
  for (const event of events.sort((a, b) => order(a.taskId, b.taskId))) {
    const beforeIssues = result.issueCount;
    const task = after.get(event.taskId),
      planned = new Map();
    for (const rule of rules) {
      if (rule.trigger.to !== event.to || !rule.trigger.from.includes(event.from)) continue;
      for (const action of rule.actions) {
        if (action.field === 'assignee' && action.value) {
          const member = members.get(action.value);
          if (!isActiveMember(member) || !canReadProject(project, member.id, workspaceMemberRole(member))) {
            issue({ code: 'AUTOMATION_ASSIGNEE_UNAVAILABLE', taskId: task.id, ruleId: rule.id });
            continue;
          }
        }
        if (action.field === 'cycleId' && action.value && !project.workflow?.cycles?.some(cycle => cycle.id === action.value && !cycle.archived)) {
          issue({ code: 'AUTOMATION_CYCLE_UNAVAILABLE', taskId: task.id, ruleId: rule.id });
          continue;
        }
        const existing = planned.get(action.field);
        if (existing && existing.to !== action.value) {
          issue({ code: 'AUTOMATION_ACTION_CONFLICT', taskId: task.id, field: action.field, ruleIds: [existing.ruleIds[0], rule.id] });
          continue;
        }
        if (existing) {
          existing.ruleIds.push(rule.id);
        } else
          planned.set(action.field, {
            field: action.field,
            from: currentValue(task, action.field),
            to: action.value,
            ruleIds: [rule.id],
          });
      }
    }
    const changes = fields
      .map(field => planned.get(field))
      .filter(Boolean)
      .filter(change => {
        if (!(change.from === null || typeof change.from === 'string')) {
          issue({ code: 'AUTOMATION_TASK_VALUE_INVALID', taskId: task.id, field: change.field });
          return false;
        }
        return change.from !== change.to;
      });
    if (!changes.length && result.issueCount === beforeIssues) result.noops++;
    result.proposedOperations += changes.length;
    if (result.proposedOperations > maxOperations) {
      result.complete = false;
      issue({ code: 'AUTOMATION_OPERATION_LIMIT', limit: maxOperations });
      break;
    }
    if (changes.length) result.changes.push({ taskId: task.id, fields: changes });
  }
  // Even a caller that accidentally ignores `blocked` cannot apply a partial plan.
  if (result.blocked) result.changes = [];
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > AUTOMATION_LIMITS.previewBytes) {
    result.complete = false;
    issue({ code: 'AUTOMATION_PREVIEW_SIZE_LIMIT', limit: AUTOMATION_LIMITS.previewBytes });
    result.changes = [];
  }
  return result;
}
