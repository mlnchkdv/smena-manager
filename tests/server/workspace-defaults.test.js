import assert from 'node:assert/strict';
import test from 'node:test';
import { applyEntityDefaults } from '../../src/shared/workspace-defaults.js';

test('optional task and project fields get independent safe defaults without masking malformed data', () => {
  const data = { tasks: [{ id: 'a' }, { id: 'b', labels: 'invalid' }], projects: [{ id: 'p' }], comments: [{ id: 'c' }] };
  applyEntityDefaults(data);
  assert.deepEqual(data.tasks[0].labels, []);
  assert.equal(data.tasks[0].status, 'todo');
  assert.equal(data.tasks[1].labels, 'invalid');
  assert.deepEqual(data.projects[0].members, []);
  assert.deepEqual(data.comments[0].re, {});
  data.tasks[0].subtasks.push({ id: 'sub' });
  assert.equal(data.tasks[1].subtasks.length, 0);
});
