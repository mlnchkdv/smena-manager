import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeWorkspaceData } from '../../src/shared/workspace-merge.js';

test('workspace merge keeps independent changes from two clients', () => {
  const base = {
    ws: { name: 'Smena', color: 'indigo' },
    tasks: [
      { id: 't1', title: 'One', status: 'todo' },
      { id: 't2', title: 'Two', status: 'todo' },
    ],
  };
  const local = structuredClone(base);
  local.tasks[0].status = 'done';
  const remote = structuredClone(base);
  remote.tasks[1].title = 'Two updated';

  const result = mergeWorkspaceData(base, local, remote);

  assert.deepEqual(result.conflicts, []);
  assert.equal(result.data.tasks.find(task => task.id === 't1').status, 'done');
  assert.equal(result.data.tasks.find(task => task.id === 't2').title, 'Two updated');
});

test('workspace merge preserves independent additions and deletions', () => {
  const base = { tasks: [{ id: 't1', title: 'One' }] };
  const local = { tasks: [] };
  const remote = { tasks: [...base.tasks, { id: 't2', title: 'Two' }] };

  const result = mergeWorkspaceData(base, local, remote);

  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.data.tasks, [{ id: 't2', title: 'Two' }]);
});

test('workspace merge reports edits to the same field', () => {
  const base = { tasks: [{ id: 't1', title: 'Original', status: 'todo' }] };
  const local = { tasks: [{ id: 't1', title: 'Local', status: 'todo' }] };
  const remote = { tasks: [{ id: 't1', title: 'Remote', status: 'todo' }] };

  const result = mergeWorkspaceData(base, local, remote);

  assert.deepEqual(result.conflicts, ['tasks[t1].title']);
  assert.equal(result.data.tasks[0].title, 'Remote');
});

test('workspace merge combines different fields on the same entity', () => {
  const base = { tasks: [{ id: 't1', title: 'Original', status: 'todo' }] };
  const local = { tasks: [{ id: 't1', title: 'Local', status: 'todo' }] };
  const remote = { tasks: [{ id: 't1', title: 'Original', status: 'done' }] };

  const result = mergeWorkspaceData(base, local, remote);

  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.data.tasks, [{ id: 't1', title: 'Local', status: 'done' }]);
});
