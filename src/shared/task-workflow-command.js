import { projectWorkflowIssues } from './project-workflow.js';

// Workspace commands mutate captured task references. Snapshot JSON containers
// without serializing source strings, then roll back the entire root on failure:
// recurrence, sequence numbers, links, attachments and activity are one command.
export function snapshotTaskCommand(data, { maxObjects = 1_000_000 } = {}) {
  const seen = new WeakMap();
  let count = 0;
  const copy = value => {
    if (!value || typeof value !== 'object') return value;
    if (seen.has(value)) return seen.get(value);
    if (++count > maxObjects) throw new Error('Workspace command snapshot exceeds its object budget.');
    const prototype = Object.getPrototypeOf(value);
    if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) throw new TypeError('Expected JSON workspace data.');
    const result = Array.isArray(value) ? [] : Object.create(prototype);
    seen.set(value, result);
    for (const key of Object.keys(value)) Object.defineProperty(result, key, { value: copy(value[key]), enumerable: true, writable: true, configurable: true });
    return result;
  };
  return copy(data);
}

export function runTaskWorkflowCommand(data, command, readNext, options = {}) {
  let before;
  try {
    if (command.constructor?.name === 'AsyncFunction') throw new TypeError('Task commands must be synchronous.');
    before = snapshotTaskCommand(data, options);
  } catch {
    return { applied: false, data, issues: [{ code: 'WORKFLOW_COMMAND_FAILED' }] };
  }
  try {
    const result = command();
    if (result?.then) throw new TypeError('Task commands must be synchronous.');
    const next = readNext();
    const issues = projectWorkflowIssues(before, next, { actor: options.actor });
    return issues.length ? { applied: false, data: before, issues } : { applied: true, data: next, issues: [] };
  } catch {
    return { applied: false, data: before, issues: [{ code: 'WORKFLOW_COMMAND_FAILED' }] };
  }
}
