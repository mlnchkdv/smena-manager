import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultProjectWorkflow, validProjectWorkflow, projectWorkflowIssues, sameProjectWorkflow } from '../../src/shared/project-workflow.js';

const member = { id: 'editor', role: 'Member', status: 'active' };
const base = () => ({
  projects: [{ id: 'p', name: 'Project', lead: 'editor' }],
  members: [member],
  tasks: [{ id: 'a', project: 'p', status: 'todo', subtasks: [], deps: [] }],
});
const configured = () => {
  const value = base();
  value.projects[0].workflow = defaultProjectWorkflow();
  return value;
};
test('the standard workflow preserves canonical states, independent instances and legacy behavior', () => {
  const before = base(),
    next = structuredClone(before);
  next.tasks[0].status = 'done';
  assert.deepEqual(projectWorkflowIssues(before, next), []);
  const one = defaultProjectWorkflow(),
    two = defaultProjectWorkflow();
  one.transitions.todo = [];
  assert.ok(two.transitions.todo.includes('done'));
  assert.equal(validProjectWorkflow(two), true);
  assert.equal(validProjectWorkflow(null), true);
});
test('workflow model rejects malformed transitions, limits, rules and cycles', () => {
  for (const change of [
    flow => flow.transitions.todo.push('unknown'),
    flow => flow.transitions.todo.push('todo'),
    flow => flow.transitions.todo.push('done'),
    flow => (flow.wip.progress = -1),
    flow => (flow.wip.done = 1),
    flow => (flow.wip.todo = 1.5),
    flow => (flow.ready.review.assignee = 'yes'),
    flow => (flow.ready.done.extra = true),
    flow => (flow.activeCycleId = 'missing'),
    flow => flow.cycles.push(null),
    flow => flow.cycles.push({ id: 'c', name: 'Cycle', start: '2026-02-30', end: '2026-03-03', archived: false }),
  ]) {
    const flow = defaultProjectWorkflow();
    change(flow);
    assert.equal(validProjectWorkflow(flow), false);
  }
});
test('only a full-access actor can change project process settings', () => {
  const current = base(),
    next = configured();
  next.projects[0].lead = 'another';
  current.projects[0].lead = 'another';
  assert.equal(projectWorkflowIssues(current, next, { actor: { memberId: 'editor', role: 'editor' } })[0].code, 'WORKFLOW_FORBIDDEN');
  assert.deepEqual(projectWorkflowIssues(current, next, { actor: { memberId: 'owner', role: 'admin' } }), []);
});
test('equivalent key/target ordering does not become an unauthorized settings edit', () => {
  const current = configured();
  current.projects[0].lead = 'another';
  const next = structuredClone(current),
    flow = next.projects[0].workflow;
  flow.transitions = Object.fromEntries(
    Object.entries(flow.transitions)
      .reverse()
      .map(([key, values]) => [key, values.reverse()]),
  );
  flow.ready = Object.fromEntries(
    Object.entries(flow.ready)
      .reverse()
      .map(([key, rules]) => [key, Object.fromEntries(Object.entries(rules).reverse())]),
  );
  assert.equal(sameProjectWorkflow(current.projects[0].workflow, flow), true);
  assert.deepEqual(projectWorkflowIssues(current, next, { actor: { memberId: 'editor', role: 'editor' } }), []);
});
test('description readiness recognizes whitespace entities and bounded diagnostics handle large task sets', () => {
  const current = configured();
  current.projects[0].workflow.ready.done.description = true;
  const next = structuredClone(current);
  next.tasks[0].status = 'done';
  next.tasks[0].desc = '<p>&#x00a0; &nbsp; &#00160;</p>';
  assert.deepEqual(projectWorkflowIssues(current, next)[0].missing, ['description']);
  next.tasks[0].desc = '<p>Useful text</p>';
  assert.deepEqual(projectWorkflowIssues(current, next), []);
  next.tasks = Array.from({ length: 10001 }, (_, i) => ({ id: `new-${i}`, project: 'p', status: 'done', desc: '' }));
  assert.equal(projectWorkflowIssues(current, next, { limit: 10 }).length, 10);
});
test('transitions and readiness apply to new entrants, preserving unrelated old work', () => {
  const current = configured(),
    next = structuredClone(current),
    flow = next.projects[0].workflow;
  flow.transitions.todo = ['progress'];
  flow.ready.done = { assignee: true, description: true, due: true, subtasks: true, dependencies: true };
  next.tasks[0] = { ...next.tasks[0], status: 'done', subtasks: [{ id: 's', done: false }], deps: ['b'] };
  next.tasks.push({ id: 'b', project: 'p', status: 'todo' });
  const issues = projectWorkflowIssues(current, next);
  assert.ok(issues.some(issue => issue.code === 'WORKFLOW_TRANSITION'));
  assert.deepEqual(issues.find(issue => issue.code === 'WORKFLOW_READY').missing, ['assignee', 'description', 'due', 'subtasks', 'dependencies']);
  const unchanged = structuredClone(next);
  unchanged.tasks[0].title = 'An unrelated title edit';
  assert.deepEqual(projectWorkflowIssues(next, unchanged), []);
  next.tasks[0].status = 'progress';
  assert.deepEqual(projectWorkflowIssues(current, next), []);
});
test('a bulk WIP swap uses the whole result; over-limit columns can drain but cannot admit new work', () => {
  const current = configured();
  current.projects[0].workflow.wip.progress = 1;
  current.tasks.push({ id: 'b', project: 'p', status: 'progress' });
  const next = structuredClone(current);
  next.tasks[0].status = 'progress';
  next.tasks[1].status = 'done';
  assert.deepEqual(projectWorkflowIssues(current, next), []);
  next.tasks[1].status = 'progress';
  assert.equal(projectWorkflowIssues(current, next).at(-1).code, 'WORKFLOW_WIP');
  const lowered = structuredClone(next);
  lowered.tasks[0].title = 'Keep existing work';
  assert.deepEqual(projectWorkflowIssues(next, lowered), []);
  lowered.tasks[0].status = 'done';
  assert.deepEqual(projectWorkflowIssues(next, lowered), []);
  lowered.tasks[1].archived = true;
  assert.deepEqual(projectWorkflowIssues(next, lowered), []);
  const restored = structuredClone(lowered);
  restored.tasks[0].status = 'progress';
  restored.tasks[1].archived = false;
  assert.ok(projectWorkflowIssues(lowered, restored).some(issue => issue.code === 'WORKFLOW_WIP'));
});
test('cycle archival retains assignments and IDs while rejecting new assignments or removal of used cycles', () => {
  const current = configured(),
    flow = current.projects[0].workflow;
  flow.cycles.push({ id: 'cycle', name: 'Week', start: '2026-11-09', end: '2026-11-15', archived: false });
  flow.activeCycleId = 'cycle';
  current.tasks[0].cycleId = 'cycle';
  const next = structuredClone(current);
  next.projects[0].workflow.cycles[0].archived = true;
  next.projects[0].workflow.activeCycleId = '';
  assert.deepEqual(projectWorkflowIssues(current, next), []);
  next.tasks.push({ id: 'b', project: 'p', status: 'todo', cycleId: 'cycle' });
  assert.ok(projectWorkflowIssues(current, next).some(issue => issue.code === 'WORKFLOW_CYCLE_UNAVAILABLE' && issue.taskId === 'b'));
  next.tasks.pop();
  next.projects[0].workflow.cycles = [];
  assert.ok(projectWorkflowIssues(current, next).some(issue => issue.code === 'WORKFLOW_CYCLE_UNAVAILABLE' && issue.taskId === 'a'));
});
test('enabling a process validates legacy cycle fields even when the new cycle list is empty', () => {
  const current = base();
  current.tasks[0].cycleId = 'external-cycle';
  const next = structuredClone(current);
  next.projects[0].workflow = defaultProjectWorkflow();
  assert.ok(projectWorkflowIssues(current, next).some(issue => issue.code === 'WORKFLOW_CYCLE_UNAVAILABLE'));
});
test('dependency readiness never discloses the state of a private dependency; diagnostics are bounded', () => {
  const current = configured();
  current.projects.push({ id: 'private', private: true, lead: 'other' });
  current.projects[0].workflow.ready.done.dependencies = true;
  current.tasks[0].deps = ['secret'];
  current.tasks.push({ id: 'secret', project: 'private', status: 'done' });
  const next = structuredClone(current);
  next.tasks[0].status = 'done';
  assert.deepEqual(projectWorkflowIssues(current, next, { actor: { memberId: 'owner', role: 'admin' } }), []);
  const editor = projectWorkflowIssues(current, next, { actor: { memberId: 'editor', role: 'editor' } });
  next.tasks[1].status = 'todo';
  assert.deepEqual(projectWorkflowIssues(current, next, { actor: { memberId: 'editor', role: 'editor' } }), editor);
  assert.deepEqual(editor[0].missing, ['dependencies']);
  next.projects[0].workflow.ready.done.due = true;
  assert.equal(projectWorkflowIssues(current, next, { limit: 1 }).length, 1);
});
