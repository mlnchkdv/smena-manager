import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultProjectAutomations,
  validProjectAutomations,
  projectAutomationsSignature,
  automationEventKey,
  planProjectAutomations,
  AUTOMATION_LIMITS,
} from '../../src/shared/project-automations.js';

const rule = (id = 'r', actions = [{ field: 'priority', value: 'high' }]) => ({
  id,
  name: 'Rule / Правило',
  enabled: true,
  trigger: { from: ['todo', 'created'], to: 'progress' },
  actions,
});
const program = (...rules) => ({ version: 1, rules: rules.length ? rules : [rule()] });
function fixture() {
  return {
    revision: 7,
    members: [
      { id: 'owner', role: 'Owner', status: 'active' },
      { id: 'editor', role: 'Member', status: 'active' },
      { id: 'reader', role: 'Guest', status: 'active' },
      { id: 'outside', role: 'Member', status: 'active' },
      { id: 'removed', role: 'Member', status: 'removed' },
    ],
    projects: [
      {
        id: 'p',
        access: 'private',
        lead: 'owner',
        members: ['editor', 'reader'],
        perms: { editor: 'Can edit', reader: 'Can view' },
        workflow: {
          cycles: [
            { id: 'live', archived: false },
            { id: 'old', archived: true },
          ],
        },
      },
      { id: 'q', lead: 'outside', members: [] },
    ],
    tasks: [
      { id: 'a', project: 'p', status: 'todo', priority: 'low', assignee: null, cycleId: '', desc: '<p>private task body</p>' },
      { id: 'other', project: 'q', status: 'todo', priority: 'low' },
    ],
    knowledgeNotes: [{ formatted_markdown: '# Never included in a plan' }],
  };
}
function transition() {
  const current = fixture(),
    next = structuredClone(current);
  next.tasks[0].status = 'progress';
  return { current, next };
}
const plan = (current, next, rules = program(), options = {}) => planProjectAutomations(current, next, 'p', rules, { actorId: 'owner', ...options });

test('strict automation contracts permit only bounded declarative assignment actions', () => {
  assert.equal(validProjectAutomations(defaultProjectAutomations()), true);
  assert.equal(
    validProjectAutomations(
      program(
        rule('r', [
          { field: 'priority', value: 'urgent' },
          { field: 'assignee', value: null },
          { field: 'cycleId', value: '' },
        ]),
      ),
    ),
    true,
  );
  const invalid = [
    p => (p.version = 2),
    p => (p.script = 'fetch(secret)'),
    p => (p.rules[0].actions[0].field = 'email'),
    p => (p.rules[0].actions[0].field = 'status'),
    p => (p.rules[0].actions[0].value = {}),
    p => (p.rules[0].actions[0].value = 'constructor'),
    p => p.rules[0].actions.push({ field: 'priority', value: 'low' }),
    p => (p.rules[0].name = ' '),
    p => (p.rules[0].name = 'x'.repeat(81)),
    p => (p.rules[0].enabled = 'yes'),
    p => (p.rules[0].trigger.from = []),
    p => p.rules[0].trigger.from.push('todo'),
    p => (p.rules[0].trigger.from = ['progress']),
    p => (p.rules[0].trigger.to = '__proto__'),
    p => (p.rules[0].trigger.code = 'eval'),
    p => p.rules.push(structuredClone(p.rules[0])),
    p => (p.rules = Array.from({ length: 21 }, (_, i) => rule('r' + i))),
  ];
  for (const mutate of invalid) {
    const p = program();
    mutate(p);
    assert.equal(validProjectAutomations(p), false, String(mutate));
  }
  for (const value of [null, [], false, '', { version: 1, rules: 'bad' }]) assert.equal(validProjectAutomations(value), false);
});

test('canonical signatures are independent of property/rule/action/source ordering and retain meaningful edits', () => {
  const first = program(
    rule('b'),
    rule('a', [
      { field: 'assignee', value: 'editor' },
      { field: 'priority', value: 'high' },
    ]),
  );
  const second = structuredClone(first);
  second.rules.reverse();
  second.rules.forEach(r => {
    r.actions.reverse();
    r.trigger.from.reverse();
  });
  assert.equal(projectAutomationsSignature(first), projectAutomationsSignature(second));
  second.rules[0].name += ' changed';
  assert.notEqual(projectAutomationsSignature(first), projectAutomationsSignature(second));
  assert.throws(() => projectAutomationsSignature({ version: 2, rules: [] }), { code: 'AUTOMATION_INVALID' });
});

test('event identities separate projects, rules, task identity, transitions and canonical revisions', () => {
  const e = { taskId: 'task:a', from: 'todo', to: 'progress' },
    key = automationEventKey('p:a', 'r:b', e, 7);
  assert.equal(key, automationEventKey('p:a', 'r:b', { to: 'progress', from: 'todo', taskId: 'task:a' }, 7));
  assert.notEqual(key, automationEventKey('p', 'a:r:b', e, 7));
  assert.notEqual(key, automationEventKey('p:a', 'r:b', e, 8));
  for (const revision of [-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => automationEventKey('p', 'r', e, revision), { code: 'AUTOMATION_EVENT_INVALID' });
  assert.throws(() => automationEventKey('p', 'r', { ...e, from: 'progress' }, 7));
});

test('a preview returns minimal proposed fields without mutating the program or either snapshot', () => {
  const { current, next } = transition(),
    p = program(
      rule('r', [
        { field: 'priority', value: 'high' },
        { field: 'assignee', value: 'editor' },
        { field: 'cycleId', value: 'live' },
      ]),
    );
  const original = structuredClone({ current, next, p }),
    result = plan(current, next, p);
  assert.deepEqual({ current, next, p }, original);
  assert.equal(result.mode, 'preview');
  assert.equal(result.executionEnabled, false);
  assert.equal(result.requiresCanonicalValidation, true);
  assert.equal(result.appliedOperations, 0);
  assert.equal(result.proposedOperations, 3);
  assert.equal(result.blocked, false);
  assert.deepEqual(
    result.changes.map(c => [c.taskId, c.fields.map(f => [f.field, f.from, f.to])]),
    [
      [
        'a',
        [
          ['priority', 'low', 'high'],
          ['assignee', null, 'editor'],
          ['cycleId', '', 'live'],
        ],
      ],
    ],
  );
  assert.equal(JSON.stringify(result).includes('private task body'), false);
  assert.equal(JSON.stringify(result).includes('Never included'), false);
  result.changes[0].fields[0].ruleIds.push('not-in-program');
  assert.equal(p.rules.length, 1);
});

test('preview reads no task bodies, knowledge, files or external side channels', () => {
  const { current, next } = transition();
  for (const data of [current, next]) {
    for (const key of ['knowledgeNotes', 'files', 'knowledgeBodies', '_credentials'])
      Object.defineProperty(data, key, {
        get() {
          throw Error('Unrelated ' + key);
        },
      });
    for (const task of data.tasks)
      Object.defineProperty(task, 'desc', {
        get() {
          throw Error('Task body read');
        },
      });
  }
  assert.equal(plan(current, next).changes.length, 1);
});

test('canonical membership and visibility apply before any program inspection', () => {
  const { current, next } = transition();
  for (const actorId of ['outside', 'removed', 'missing'])
    assert.throws(() => plan(current, next, program(), { actorId }), { code: 'AUTOMATION_NOT_FOUND', statusCode: 404 });
  assert.equal(plan(current, next, program(), { actorId: 'reader' }).blocked, false, 'read-only preview is not an execution permission');
  assert.throws(() => plan(current, next, program(), { actorId: 'outside', role: 'admin' }), { code: 'AUTOMATION_OPTIONS_INVALID' });
  next.members.find(m => m.id === 'owner').status = 'removed';
  assert.throws(() => plan(current, next), { code: 'AUTOMATION_NOT_FOUND' });
  const hidden = {
    get version() {
      throw Error('Program inspected before ACL');
    },
  };
  assert.throws(() => plan(current, next, hidden), { code: 'AUTOMATION_NOT_FOUND' });
});

test('creation/status transitions are distinct from unchanged work, project moves and restoration', () => {
  const current = fixture(),
    next = structuredClone(current);
  next.tasks[0].status = 'progress';
  next.tasks.push({ id: 'created', project: 'p', status: 'progress', priority: 'low' });
  current.tasks.push({ id: 'restore', project: 'p', status: 'todo', archived: true }, { id: 'move', project: 'q', status: 'todo' });
  next.tasks.push({ id: 'restore', project: 'p', status: 'progress', archived: false }, { id: 'move', project: 'p', status: 'progress' });
  next.tasks.find(t => t.id === 'other').status = 'progress';
  assert.deepEqual(
    plan(current, next).changes.map(c => c.taskId),
    ['a', 'created'],
  );
  assert.equal(plan(current, current).triggeredTasks, 0);
  next.tasks[0].archived = true;
  assert.deepEqual(
    plan(current, next).changes.map(c => c.taskId),
    ['created'],
  );
});

test('disabled rules do not run implicitly and explicit inspection still never enables execution', () => {
  const { current, next } = transition(),
    p = program();
  p.rules[0].enabled = false;
  assert.equal(plan(current, next, p).changes.length, 0);
  const result = plan(current, next, p, { inspectDisabled: true });
  assert.equal(result.changes.length, 1);
  assert.equal(result.executionEnabled, false);
  assert.equal(p.rules[0].enabled, false);
  for (const data of [current, next])
    data.tasks = [
      {
        get id() {
          throw Error('Disabled program scanned tasks');
        },
      },
    ];
  assert.equal(plan(current, next, p).triggeredTasks, 0);
});

test('identical overlapping actions merge, differing actions block the entire preview without first-rule wins', () => {
  const { current, next } = transition(),
    same = plan(current, next, program(rule('a'), rule('b')));
  assert.equal(same.proposedOperations, 1);
  assert.deepEqual(same.changes[0].fields[0].ruleIds, ['a', 'b']);
  const bad = program(rule('a'), rule('b', [{ field: 'priority', value: 'urgent' }]));
  const before = structuredClone(next),
    result = plan(current, next, bad);
  assert.equal(result.blocked, true);
  assert.deepEqual(result.changes, []);
  assert.deepEqual(next, before);
  assert.equal(result.issues[0].code, 'AUTOMATION_ACTION_CONFLICT');
  bad.rules.reverse();
  assert.deepEqual(plan(current, next, bad), result);
});

test('unavailable assignees and archived/foreign cycles block every proposed patch, even with other valid actions', () => {
  const { current, next } = transition();
  for (const action of [
    { field: 'assignee', value: 'outside' },
    { field: 'assignee', value: 'removed' },
    { field: 'assignee', value: 'missing' },
    { field: 'cycleId', value: 'old' },
    { field: 'cycleId', value: 'foreign' },
  ]) {
    const result = plan(current, next, program(rule('r', [{ field: 'priority', value: 'high' }, action])));
    assert.equal(result.blocked, true);
    assert.deepEqual(result.changes, []);
    assert.equal(result.noops, 0);
    assert.equal(result.appliedOperations, 0);
  }
});

test('matching existing assignments count as no-ops, with no repeated patch or fabricated application', () => {
  const { current, next } = transition();
  next.tasks[0].priority = 'high';
  const result = plan(current, next);
  assert.equal(result.noops, 1);
  assert.equal(result.proposedOperations, 0);
  assert.equal(result.appliedOperations, 0);
  assert.deepEqual(result.changes, []);
});

test('event and operation limits fail closed instead of truncating a runnable batch', () => {
  const { current, next } = transition();
  current.tasks = Array.from({ length: 10_001 }, (_, i) => ({ id: 't' + i, project: 'p', status: 'todo', priority: 'low' }));
  next.tasks = current.tasks.map(t => ({ ...t, status: 'progress' }));
  const large = plan(current, next);
  assert.equal(large.triggeredTasks, 10_001);
  assert.equal(large.complete, false);
  assert.equal(large.blocked, true);
  assert.deepEqual(large.changes, []);
  assert.equal(large.issues[0].code, 'AUTOMATION_EVENT_LIMIT');
  assert.ok(JSON.stringify(large).length < 5000);
  const small = transition(),
    limit = plan(
      small.current,
      small.next,
      program(
        rule('r', [
          { field: 'priority', value: 'high' },
          { field: 'assignee', value: 'editor' },
        ]),
      ),
      { maxOperations: 1 },
    );
  assert.equal(limit.blocked, true);
  assert.equal(limit.complete, false);
  assert.deepEqual(limit.changes, []);
  assert.equal(limit.issues[0].code, 'AUTOMATION_OPERATION_LIMIT');
  for (const maxOperations of [0, -1, 1.5, 201, Infinity])
    assert.throws(() => plan(small.current, small.next, program(), { maxOperations }), { code: 'AUTOMATION_OPTIONS_INVALID' });
});

test('diagnostic output is bounded and does not count rejected actions as no-ops', () => {
  const { current, next } = transition();
  current.tasks = Array.from({ length: 30 }, (_, i) => ({ id: 't' + i, project: 'p', status: 'todo' }));
  next.tasks = current.tasks.map(t => ({ ...t, status: 'progress' }));
  const result = plan(current, next, program(rule('r', [{ field: 'assignee', value: 'missing' }])));
  assert.equal(result.issueCount, 30);
  assert.equal(result.issues.length, AUTOMATION_LIMITS.issues);
  assert.equal(result.issuesTruncated, true);
  assert.equal(result.noops, 0);
  assert.equal(result.complete, true);
  assert.equal(result.blocked, true);
  assert.deepEqual(result.changes, []);
});

test('malformed current field values cannot make the preview export task payloads or unbounded text', () => {
  for (const value of [{ secret: 'do not export' }, 'private'.repeat(100_000), 42]) {
    const { current, next } = transition();
    next.tasks[0].priority = value;
    const result = plan(current, next);
    assert.equal(result.blocked, true);
    assert.deepEqual(result.changes, []);
    assert.equal(result.issues[0].code, 'AUTOMATION_TASK_VALUE_INVALID');
    assert.ok(JSON.stringify(result).length < 3000);
  }
});

test('UTF-8 output has a separate byte limit and never exposes a truncated runnable plan', () => {
  const { current, next } = transition();
  current.tasks = Array.from({ length: 100 }, (_, i) => ({ id: 't' + i, project: 'p', status: 'todo', priority: 'low', cycleId: '' }));
  next.tasks = current.tasks.map(t => ({ ...t, status: 'progress' }));
  const p = program(
    ...Array.from({ length: 20 }, (_, i) =>
      rule('r' + i + 'я'.repeat(170), [
        { field: 'priority', value: 'high' },
        { field: 'cycleId', value: 'live' },
      ]),
    ),
  );
  const result = plan(current, next, p);
  assert.equal(result.blocked, true);
  assert.equal(result.complete, false);
  assert.deepEqual(result.changes, []);
  assert.equal(result.issues.at(-1).code, 'AUTOMATION_PREVIEW_SIZE_LIMIT');
  assert.ok(new TextEncoder().encode(JSON.stringify(result)).byteLength < AUTOMATION_LIMITS.previewBytes);
});

test('partial snapshots, duplicate task identities, malformed options and archived projects are refused', () => {
  const { current, next } = transition();
  assert.throws(() => plan({ ...current, tasks: undefined }, next), { code: 'AUTOMATION_CONTEXT_INVALID' });
  assert.throws(() => plan({ ...current, revision: -1 }, next), { code: 'AUTOMATION_CONTEXT_INVALID' });
  assert.throws(() => plan(current, { ...next, tasks: [...next.tasks, next.tasks[0]] }), { code: 'AUTOMATION_CONTEXT_INVALID' });
  assert.throws(() => plan(current, { ...next, projects: [...next.projects, next.projects[0]] }), { code: 'AUTOMATION_CONTEXT_INVALID' });
  assert.throws(() => plan(current, { ...next, members: [...next.members, next.members[0]] }), { code: 'AUTOMATION_CONTEXT_INVALID' });
  const malformedId = { privatePayload: 'not an identity' };
  assert.throws(() => planProjectAutomations(current, next, malformedId, program(), { actorId: 'owner' }), { code: 'AUTOMATION_CONTEXT_INVALID' });
  assert.throws(() => plan(current, next, program(), { inspectDisabled: 'yes' }), { code: 'AUTOMATION_OPTIONS_INVALID' });
  next.projects[0].archived = true;
  assert.throws(() => plan(current, next), { code: 'AUTOMATION_PROJECT_ARCHIVED' });
});
