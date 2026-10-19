import assert from 'node:assert/strict';
import test from 'node:test';
import { timelineMilestones } from '../../src/shared/timeline-scope.js';

test('timeline milestones stay within the projects represented by filtered tasks', () => {
  const projects = [
    { id: 'p1', milestones: [{ id: 'm1', name: 'Visible' }] },
    { id: 'p2', milestones: [{ id: 'm2', name: 'Foreign' }] },
  ];
  const result = timelineMilestones([{ id: 't1', project: 'p1' }], projects);
  assert.deepEqual(result.map(milestone => milestone.id), ['m1']);
});

test('project timeline keeps milestones for the explicitly selected project', () => {
  const selected = { id: 'p2', milestones: [{ id: 'm2', name: 'Selected' }] };
  const result = timelineMilestones([], [{ id: 'p1', milestones: [{ id: 'm1' }] }], selected);
  assert.deepEqual(result.map(milestone => milestone.id), ['m2']);
});
