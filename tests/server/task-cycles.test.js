import test from 'node:test';
import assert from 'node:assert/strict';
import { projectCycleProgress } from '../../src/shared/project-cycle-progress.js';
import {
  taskCycleValue,
  matchesTaskCycle,
  newTaskCycle,
  copiedTaskCycle,
  taskCycleChoices,
  taskCycleProject,
  filteredTaskCycle,
} from '../../src/shared/task-cycles.js';

const project = {
  id: 'p',
  workflow: {
    activeCycleId: 'active',
    cycles: [
      { id: 'active', archived: false },
      { id: 'other', archived: false },
      { id: 'old', archived: true },
    ],
  },
};
test('new work inherits a single live cycle filter without assigning archived, foreign or contradictory choices', () => {
  const rule = (id, op = 'is') => ({ f: 'cycleId', op, v: [taskCycleValue('p', id)] });
  assert.equal(filteredTaskCycle(project, [rule('other')]), 'other');
  assert.equal(filteredTaskCycle(project, [rule('')]), '');
  assert.equal(filteredTaskCycle(project, [rule('old')]), undefined);
  assert.equal(filteredTaskCycle(project, [rule('other'), rule('other', 'not')]), undefined);
  assert.equal(filteredTaskCycle(project, [{ ...rule('other'), v: [taskCycleValue('foreign', 'other')] }]), undefined);
  assert.equal(filteredTaskCycle(project, [rule('other', 'not')]), undefined);
  assert.equal(filteredTaskCycle(project, [{ ...rule('other'), v: [taskCycleValue('p', 'active'), taskCycleValue('p', 'other')] }]), undefined);
  assert.equal(filteredTaskCycle(project), undefined);
});
test('new work defaults to the live active cycle, with an explicit no-cycle choice preserved', () => {
  assert.equal(newTaskCycle(project), 'active');
  assert.equal(newTaskCycle(project, ''), '');
  assert.equal(newTaskCycle(project, null), '');
  assert.equal(newTaskCycle(project, 'other'), 'other');
  assert.equal(newTaskCycle({}), '');
  assert.equal(newTaskCycle({ workflow: { activeCycleId: 'old', cycles: project.workflow.cycles } }), '');
  assert.equal(newTaskCycle({ workflow: { activeCycleId: 'missing', cycles: [] } }), '');
});
test('recurrence and copies retain live cycle choices but never add new work to an archived cycle', () => {
  assert.equal(copiedTaskCycle(project, ''), '');
  assert.equal(copiedTaskCycle(project, 'other'), 'other');
  assert.equal(copiedTaskCycle(project, 'old'), 'active');
  assert.equal(copiedTaskCycle(project, 'missing'), 'active');
  assert.equal(copiedTaskCycle({ workflow: { cycles: [{ id: 'old', archived: true }], activeCycleId: '' } }, 'old'), '');
});
test('ordinary pickers retain an archived current choice while planning filters include every historical cycle', () => {
  assert.deepEqual(
    taskCycleChoices(project, '').map(c => c.id),
    ['active', 'other'],
  );
  assert.deepEqual(
    taskCycleChoices(project, 'old').map(c => c.id),
    ['active', 'other', 'old'],
  );
  assert.equal(taskCycleChoices(project, '', { includeArchived: true }).length, 3);
  assert.deepEqual(taskCycleChoices({}, ''), []);
});
test('filters distinguish projects, punctuation, unicode and no cycle without delimiter collisions', () => {
  const first = { project: 'project:a', cycleId: 'cycle:b' },
    other = { project: 'project', cycleId: 'a:cycle:b' };
  const filter = [taskCycleValue(first.project, first.cycleId)];
  assert.equal(matchesTaskCycle(first, filter), true);
  assert.equal(matchesTaskCycle(other, filter), false);
  assert.equal(matchesTaskCycle({ project: 'other', cycleId: first.cycleId }, filter), false);
  assert.equal(matchesTaskCycle({ project: 'проект', cycleId: 'цикл' }, [taskCycleValue('проект', 'цикл')]), true);
  assert.equal(matchesTaskCycle({ project: 'p', cycleId: '' }, [taskCycleValue('p')]), true);
  assert.equal(matchesTaskCycle({ project: 'p', cycleId: '@none' }, [taskCycleValue('p')]), false);
  assert.notEqual(taskCycleValue('p', '%3A'), taskCycleValue('p', ':'));
});
test('bulk cycle scope is a single actual project, never equal cycle names across different projects', () => {
  assert.equal(taskCycleProject([], [project]), null);
  assert.equal(taskCycleProject([{ project: 'p' }, { project: 'p' }], [project]), project);
  assert.equal(taskCycleProject([{ project: 'p' }, { project: 'other' }], [project]), null);
  assert.equal(taskCycleProject([{ project: 'missing' }], [project]), null);
});
test('cycle reports count only active tasks in their own project and distinguish unknown from unassigned', () => {
  const source = {
    id: 'p',
    workflow: {
      activeCycleId: 'active',
      cycles: [
        { id: 'future', name: 'Future', end: '2026-12-31', archived: false },
        { id: 'active', name: 'Active', end: '2026-11-15', archived: false },
        { id: 'old', name: 'Historical', end: '2026-10-31', archived: true },
      ],
    },
  };
  const before = structuredClone(source),
    report = projectCycleProgress(
      source,
      [
        { project: 'p', cycleId: 'active', status: 'done' },
        { project: 'p', cycleId: 'active', status: 'todo' },
        { project: 'p', cycleId: 'active', status: 'done', archived: true },
        { project: 'other', cycleId: 'active', status: 'done' },
        { project: 'p', cycleId: 'old', status: 'done' },
        { project: 'p', cycleId: 'unknown', status: 'todo' },
        { project: 'p', status: 'todo' },
      ],
      1,
    );
  assert.equal(report.total, 5);
  assert.equal(report.unassigned, 1);
  assert.equal(report.unknown, 1);
  assert.equal(report.available, 2);
  assert.deepEqual(
    report.cycles.map(cycle => [cycle.id, cycle.tasks, cycle.completed]),
    [['active', 2, 1]],
  );
  assert.deepEqual(source, before);
  assert.throws(() => projectCycleProgress(source, [], 100));
});
test('a bounded cycle summary processes a large task set without dropping the active cycle', () => {
  const tasks = Array.from({ length: 10_001 }, (_, i) => ({ id: 't' + i, project: 'p', cycleId: 'active', status: i % 2 ? 'todo' : 'done' }));
  const source = { ...project, workflow: { ...project.workflow, cycles: project.workflow.cycles.map(c => ({ ...c, name: c.id, end: '2026-11-15' })) } };
  const report = projectCycleProgress(source, tasks, 2);
  assert.equal(report.total, 10_001);
  assert.equal(report.cycles.length, 2);
  assert.equal(report.cycles[0].id, 'active');
  assert.equal(report.cycles[0].tasks, 10_001);
  assert.equal(report.cycles[0].completed, 5_001);
});
