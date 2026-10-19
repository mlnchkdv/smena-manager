import assert from 'node:assert/strict';
import test from 'node:test';
import { nextTaskKey } from '../../src/actions/task-key.js';

test('task key allocation remains deterministic and scoped to a project', () => {
  const project = { key: 'PRJ', seq: 200 };
  assert.equal(nextTaskKey(project), 'PRJ-201');
  assert.equal(nextTaskKey(project), 'PRJ-202');
});
