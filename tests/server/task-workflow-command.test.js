import test from 'node:test';
import assert from 'node:assert/strict';
import { runTaskWorkflowCommand, snapshotTaskCommand } from '../../src/shared/task-workflow-command.js';
import { defaultProjectWorkflow } from '../../src/shared/project-workflow.js';
import { cancelPendingUndo, captureUndo, completeUndo, undoCommand } from '../../src/shared/undo.js';

const fixture = () => ({
  projects: [{ id: 'p', seq: 3, workflow: defaultProjectWorkflow() }],
  tasks: [
    { id: 'a', project: 'p', status: 'todo' },
    { id: 'b', project: 'p', status: 'progress' },
  ],
  activity: [],
  files: [],
  relations: [],
  trash: [],
});
test('a denied command rolls back recurrence, keys, activity, files and relations together', () => {
  let data = fixture();
  data.projects[0].workflow.wip.todo = 1;
  const before = structuredClone(data),
    captured = data.tasks[1];
  const result = runTaskWorkflowCommand(
    data,
    () => {
      captured.status = 'done';
      captured.completedAt = 123;
      data.tasks.push({ id: 'recurrence', project: 'p', status: 'todo' });
      data.projects[0].seq++;
      data.activity.push({ id: 'created' });
      data.files.push({ id: 'attachment' });
      data.relations.push({ id: 'link' });
    },
    () => data,
  );
  assert.equal(result.applied, false);
  assert.equal(result.issues[0].code, 'WORKFLOW_WIP');
  data = result.data;
  assert.deepEqual(data, before);
});
test('the complete batch can exchange a WIP slot and changes become the persisted root', () => {
  const data = fixture();
  data.projects[0].workflow.wip.progress = 1;
  const result = runTaskWorkflowCommand(
    data,
    () => {
      data.tasks[0].status = 'progress';
      data.tasks[1].status = 'review';
    },
    () => data,
  );
  assert.equal(result.applied, true);
  assert.equal(result.data, data);
  assert.equal(data.tasks[0].status, 'progress');
});
test('readiness denies the entire batch, while unrelated edits to old work remain possible', () => {
  const data = fixture();
  data.projects[0].workflow.ready.done.due = true;
  const before = structuredClone(data);
  let result = runTaskWorkflowCommand(
    data,
    () => {
      data.tasks.forEach(task => {
        task.status = 'done';
      });
      data.tasks[0].due = '2026-11-09';
    },
    () => data,
  );
  assert.equal(result.applied, false);
  assert.deepEqual(result.data, before);
  assert.equal(result.issues[0].taskId, 'b');
  const restored = result.data;
  result = runTaskWorkflowCommand(
    restored,
    () => {
      restored.tasks[0].title = 'Unrelated';
    },
    () => restored,
  );
  assert.equal(result.applied, true);
});
test('restoring from trash and root-replacing undo both respect current workflow rules', () => {
  let data = fixture();
  data.projects[0].workflow.wip.todo = 1;
  data.trash = [{ id: 'old', data: { task: { id: 'c', project: 'p', status: 'todo' } } }];
  const before = structuredClone(data);
  let result = runTaskWorkflowCommand(
    data,
    () => {
      data.tasks.push(data.trash.pop().data.task);
    },
    () => data,
  );
  assert.equal(result.applied, false);
  assert.deepEqual(result.data, before);
  data = result.data;
  result = runTaskWorkflowCommand(
    data,
    () => {
      data = { ...data, tasks: [...data.tasks, { id: 'd', project: 'p', status: 'todo' }] };
    },
    () => data,
  );
  assert.equal(result.applied, false);
  assert.deepEqual(result.data, before);
});
test('failed synchronous commands restore the whole root; unsupported snapshots never execute a command', () => {
  const data = fixture(),
    before = structuredClone(data);
  let result = runTaskWorkflowCommand(
    data,
    () => {
      data.tasks.length = 0;
      throw new Error('Partial failure');
    },
    () => data,
  );
  assert.equal(result.applied, false);
  assert.deepEqual(result.data, before);
  let called = false;
  for (const options of [{ maxObjects: 1 }, {}]) {
    const source = options.maxObjects ? before : { ...before, opaque: new Date() };
    result = runTaskWorkflowCommand(
      source,
      () => {
        called = true;
      },
      () => source,
      options,
    );
    assert.equal(result.data, source);
    assert.equal(result.applied, false);
  }
  assert.equal(called, false);
});
test('explicit asynchronous commands are refused before they can mutate workspace data', async () => {
  const data = fixture(),
    before = structuredClone(data);
  const result = runTaskWorkflowCommand(
    data,
    async () => {
      await Promise.resolve();
      data.tasks.length = 0;
    },
    () => data,
  );
  await Promise.resolve();
  assert.equal(result.applied, false);
  assert.deepEqual(data, before);
});
test('the bounded snapshot retains primitive source text and shared container identities without JSON serialization', () => {
  const source = 'Long Markdown / Длинный Markdown\n'.repeat(70_000),
    note = { id: 'n', content: source };
  const data = { notes: Array.from({ length: 10_001 }, (_, i) => ({ id: `n${i}`, title: 'Metadata' })), note, shared: note };
  const copied = snapshotTaskCommand(data);
  assert.equal(copied.note.content, source);
  assert.equal(copied.shared, copied.note);
  assert.notEqual(copied.note, note);
  copied.notes[10_000].title = 'Changed';
  assert.equal(data.notes[10_000].title, 'Metadata');
  assert.equal(copied.notes.length, 10_001);
});
test('rejected commands cannot attach a future successful mutation to their pending undo snapshot', () => {
  const data = fixture(),
    canceled = captureUndo(data);
  cancelPendingUndo();
  data.tasks[0].title = 'Later command';
  completeUndo(data);
  assert.deepEqual(undoCommand(canceled, data).conflicts, ['undo']);
  assert.equal(canceled.after, null);
});
