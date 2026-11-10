import test from 'node:test';
import assert from 'node:assert/strict';
import { executeProjectAutomations, validateAutomationTargets } from '../../src/server/project-automations-execution.js';
import { validateAutomationHistory, appendAutomationRuns, AUTOMATION_HISTORY_LIMITS } from '../../src/server/project-automation-history.js';
import { preserveProjectAutomations } from '../../src/server/project-automations-policy.js';
import { defaultProjectWorkflow } from '../../src/shared/project-workflow.js';

const draft = () => ({
  version: 1,
  rules: [{ id: 'r', name: 'Rule', enabled: true, trigger: { from: ['todo', 'created'], to: 'progress' }, actions: [{ field: 'priority', value: 'high' }] }],
});
const fixture = () => ({
  revision: 8,
  ws: { id: 'w' },
  members: [
    { id: 'owner', role: 'Owner' },
    { id: 'editor', role: 'Member' },
    { id: 'viewer', role: 'Guest' },
  ],
  projects: [{ id: 'p', lead: 'owner', members: ['owner', 'editor', 'viewer'], automations: draft() }],
  tasks: [{ id: 'a', project: 'p', status: 'todo', priority: 'low' }],
  trash: [],
});
const change = data => ({ ...structuredClone(data), tasks: data.tasks.map(task => ({ ...task, status: 'progress' })) });
test('canonical execution applies assignments and a bounded receipt without mutating inputs or reading documents', () => {
  const current = fixture(),
    next = change(current),
    original = structuredClone(next);
  Object.defineProperty(current, 'knowledgeNotes', {
    get() {
      throw Error('No document read');
    },
  });
  const result = executeProjectAutomations(current, next, 'editor');
  assert.equal(result.tasks[0].priority, 'high');
  assert.equal(result.projects[0].automationHistory.length, 1);
  const run = result.projects[0].automationHistory[0];
  assert.equal(run.sourceRevision, 8);
  assert.equal(run.revision, 9);
  assert.equal(run.assignments, 1);
  assert.deepEqual(run.tasks, ['a']);
  assert.equal(run.actorId, 'editor');
  assert.deepEqual(next, original);
  assert.equal(current.tasks[0].priority, 'low');
  assert.equal(validateAutomationHistory(result), result);
  const isolated = structuredClone(next);
  isolated.ws.id = 'other';
  const other = structuredClone(fixture());
  other.ws.id = 'other';
  assert.notEqual(executeProjectAutomations(other, isolated, 'editor').projects[0].automationHistory[0].id, run.id);
  const committed = { ...result, revision: 9 };
  assert.equal(executeProjectAutomations(committed, structuredClone(committed), 'editor').projects[0].automationHistory.length, 1);
});
test('disabled rules, unrelated changes, restores, moves and service mutations never execute', () => {
  for (const mode of ['disabled', 'unchanged', 'restore', 'move', 'service', 'newProject']) {
    const current = fixture();
    let next = change(current),
      actor = 'editor';
    if (mode === 'disabled') {
      current.projects[0].automations.rules[0].enabled = false;
      next = change(current);
    }
    if (mode === 'unchanged') next = structuredClone(current);
    if (mode === 'restore') current.tasks[0].archived = true;
    if (mode === 'move') current.tasks[0].project = 'old';
    if (mode === 'service') actor = undefined;
    if (mode === 'newProject') current.projects = [];
    const result = executeProjectAutomations(current, next, actor);
    assert.equal(result.tasks[0].priority, 'low', mode);
    assert.equal(result.projects[0]?.automationHistory, undefined, mode);
  }
});
test('creation runs, repeat no-ops are recorded, and revoked current/candidate access is authoritative', () => {
  const current = fixture();
  current.tasks = [];
  const next = change(fixture());
  assert.equal(executeProjectAutomations(current, next, 'editor').tasks[0].priority, 'high');
  next.tasks[0].priority = 'high';
  const run = executeProjectAutomations(current, next, 'editor').projects[0].automationHistory[0];
  assert.equal(run.noops, 1);
  assert.equal(run.assignments, 0);
  for (const mutate of [
    data => (data.members[1].status = 'removed'),
    data => (data.members[1].role = 'Guest'),
    data => (data.projects[0].perms = { editor: 'Can view' }),
  ]) {
    const a = fixture(),
      b = change(a);
    mutate(a);
    assert.throws(() => executeProjectAutomations(a, b, 'editor'), { code: 'AUTOMATION_FORBIDDEN' });
    const c = fixture(),
      d = change(c);
    mutate(d);
    assert.throws(() => executeProjectAutomations(c, d, 'editor'), { code: 'AUTOMATION_FORBIDDEN' });
  }
});
test('conflicts, missing targets, stale config and final readiness reject the whole plan', () => {
  const current = fixture();
  let next = change(current);
  next.projects[0].automations.rules[0].name = 'Stale';
  assert.throws(() => executeProjectAutomations(current, next, 'owner'), { code: 'AUTOMATION_STALE' });
  for (const [field, value, code] of [
    ['assignee', 'missing', 'AUTOMATION_ASSIGNEE_UNAVAILABLE'],
    ['cycleId', 'missing', 'AUTOMATION_CYCLE_UNAVAILABLE'],
  ]) {
    const a = fixture();
    a.projects[0].automations.rules[0].actions = [{ field, value }];
    const b = change(a);
    assert.throws(() => executeProjectAutomations(a, b, 'owner'), { code });
    assert.equal(b.tasks[0].priority, 'low');
    assert.throws(() => validateAutomationTargets(a, a.projects[0], a.projects[0].automations), { code });
  }
  const a = fixture();
  a.projects[0].automations.rules.push({
    ...structuredClone(a.projects[0].automations.rules[0]),
    id: 'other',
    actions: [{ field: 'priority', value: 'urgent' }],
  });
  assert.throws(() => executeProjectAutomations(a, change(a), 'owner'), { code: 'AUTOMATION_ACTION_CONFLICT' });
  assert.throws(() => validateAutomationTargets(a, a.projects[0], a.projects[0].automations), { code: 'AUTOMATION_ACTION_CONFLICT' });
  const ready = fixture();
  ready.projects[0].workflow = defaultProjectWorkflow();
  ready.projects[0].workflow.ready.progress.assignee = true;
  ready.tasks[0].assignee = 'owner';
  ready.projects[0].automations.rules[0].actions = [{ field: 'assignee', value: null }];
  next = change(ready);
  assert.throws(() => executeProjectAutomations(ready, next, 'owner'), { code: 'WORKFLOW_READY' });
  assert.equal(next.tasks[0].assignee, 'owner');
  assert.equal(next.projects[0].automationHistory, undefined);
});
test('event and assignment limits apply across projects and leave no partial tasks or receipts', () => {
  const a = fixture();
  a.projects = Array.from({ length: 2 }, (_, i) => ({ ...a.projects[0], id: 'p' + i }));
  a.tasks = Array.from({ length: 102 }, (_, i) => ({ id: 't' + i, project: 'p' + (i < 51 ? 0 : 1), status: 'todo', priority: 'low' }));
  const b = change(a);
  assert.throws(() => executeProjectAutomations(a, b, 'owner'), { code: 'AUTOMATION_EVENT_LIMIT' });
  assert.ok(b.tasks.every(task => task.priority === 'low'));
  assert.ok(b.projects.every(p => !p.automationHistory));
  const c = fixture();
  c.projects[0].automations.rules[0].actions = [
    { field: 'priority', value: 'high' },
    { field: 'assignee', value: 'editor' },
    { field: 'cycleId', value: 'c' },
  ];
  c.projects[0].workflow = { ...defaultProjectWorkflow(), cycles: [{ id: 'c', name: 'Cycle', start: '2026-11-01', end: '2026-11-30', archived: false }] };
  c.tasks = Array.from({ length: 67 }, (_, i) => ({ id: 't' + i, project: 'p', status: 'todo', priority: 'low' }));
  assert.throws(() => executeProjectAutomations(c, change(c), 'owner'), { code: 'AUTOMATION_OPERATION_LIMIT' });
});
test('server-owned history survives snapshots/trash while new copies cannot inject it', () => {
  const a = fixture(),
    b = executeProjectAutomations(a, change(a), 'owner'),
    p = b.projects[0];
  const result = preserveProjectAutomations(b, {
    projects: [
      { ...p, automationHistory: [] },
      { ...p, id: 'copy' },
    ],
    trash: [{ kind: 'project', data: { project: { id: 'p', automationHistory: [] } } }],
  });
  assert.deepEqual(result.projects[0].automationHistory, p.automationHistory);
  assert.equal(result.projects[1].automationHistory, undefined);
  assert.deepEqual(result.trash[0].data.project.automationHistory, p.automationHistory);
});
test('history rejects forged fields/oversize and retains bounded newest runs, including global trimming', () => {
  const a = fixture(),
    r = executeProjectAutomations(a, change(a), 'owner').projects[0].automationHistory[0];
  for (const bad of [
    { ...r, actorId: {} },
    { ...r, revision: 12 },
    { ...r, matchedTasks: 101 },
    { ...r, tasks: ['a', 'a'] },
    { ...r, extra: 'hidden' },
    { ...r, at: 'invalid' },
  ])
    assert.throws(() => validateAutomationHistory({ projects: [{ automationHistory: [bad] }] }), { code: 'AUTOMATION_HISTORY_INTEGRITY' });
  let d = fixture();
  for (let i = 0; i < 25; i++)
    d = appendAutomationRuns(d, new Map([['p', { ...r, id: i.toString(16).padStart(64, '0'), sourceRevision: i, revision: i + 1 }]]));
  assert.equal(d.projects[0].automationHistory.length, 20);
  assert.equal(d.projects[0].automationHistory[0].sourceRevision, 24);
  const large = {
    projects: Array.from({ length: 160 }, (_, i) => ({
      id: 'p' + i,
      automationHistory: Array.from({ length: 20 }, (_, j) => ({ ...r, id: (i * 20 + j).toString(16).padStart(64, '0'), tasks: ['x'.repeat(180)] })),
    })),
    trash: [],
  };
  assert.throws(() => validateAutomationHistory(large), { code: 'AUTOMATION_HISTORY_INTEGRITY' });
  const trimmed = appendAutomationRuns(large, new Map());
  assert.ok(trimmed.projects.reduce((sum, p) => sum + Buffer.byteLength(JSON.stringify(p.automationHistory)), 0) <= AUTOMATION_HISTORY_LIMITS.workspaceBytes);
  assert.equal(large.projects[0].automationHistory.length, 20);
});
