import assert from 'node:assert/strict';
import test from 'node:test';
import { adminFieldsChanged, restoreUnauthorizedChanges } from '../../src/shared/workspace-permissions.js';

const baseline = {
  ws: { name: 'Команда' },
  members: [{ id: 'm1' }],
  tasks: [{ id: 't1', title: 'До' }],
};

test('viewer workspace mutations are fully restored', () => {
  const result = restoreUnauthorizedChanges(baseline, { ...baseline, tasks: [] }, 'viewer');
  assert.equal(result.denied, true);
  assert.deepEqual(result.data, baseline);
});

test('editor task changes remain while administrator fields are restored', () => {
  const candidate = {
    ...baseline,
    ws: { name: 'Другая команда' },
    tasks: [{ id: 't1', title: 'После' }],
  };
  const result = restoreUnauthorizedChanges(baseline, candidate, 'editor');
  assert.equal(result.denied, true);
  assert.deepEqual(result.fields, ['ws']);
  assert.deepEqual(result.data.ws, baseline.ws);
  assert.deepEqual(result.data.tasks, candidate.tasks);
  assert.deepEqual(adminFieldsChanged(baseline, result.data), []);
});
