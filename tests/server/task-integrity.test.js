import assert from 'node:assert/strict';
import test from 'node:test';
import { assignCanonicalTaskKeys, validateTaskTransitions } from '../../src/server/task-integrity.js';
import { calendarDate, nextRecurrenceDate, resolveTimeZone } from '../../src/shared/calendar-time.js';

test('calendar recurrence clamps month ends and uses calendar days across DST', () => {
  assert.equal(nextRecurrenceDate('2026-01-31', 'Monthly'), '2026-02-28');
  assert.equal(nextRecurrenceDate('2028-01-31', 'Monthly'), '2028-02-29');
  assert.equal(nextRecurrenceDate('2026-12-31', 'Monthly'), '2027-01-31');
  assert.equal(nextRecurrenceDate('2026-03-07', 'Daily'), '2026-03-08');
  assert.equal(calendarDate(new Date('2026-10-18T00:30:00Z'), 'America/Los_Angeles'), '2026-10-17');
  assert.equal(calendarDate(new Date('2026-10-18T00:30:00Z'), 'Europe/Saratov'), '2026-10-18');
  assert.equal(resolveTimeZone('(GMT+01:00) Berlin'), 'Europe/Berlin');
});

test('task dependency cycles and unavailable assignees are rejected without breaking unchanged legacy assignments', () => {
  const current = {
    tasks: [
      { id: 'a', deps: [] },
      { id: 'b', deps: [] },
    ],
    members: [],
    projects: [],
  };
  const cyclic = structuredClone(current);
  cyclic.tasks[0].deps = ['b'];
  cyclic.tasks[1].deps = ['a'];
  assert.throws(() => validateTaskTransitions(current, cyclic), { code: 'TASK_DEPENDENCY_CYCLE' });
  const assigned = structuredClone(current);
  assigned.members = [{ id: 'm', status: 'removed' }];
  assigned.tasks[0].assignee = 'm';
  assert.throws(() => validateTaskTransitions(current, assigned), { code: 'ASSIGNEE_UNAVAILABLE' });
  validateTaskTransitions(assigned, structuredClone(assigned));
});

test('new task keys are assigned from the stored sequence, not duplicate provisional client keys', () => {
  const current = { projects: [{ id: 'p', key: 'PRJ', seq: 201 }], tasks: [{ id: 'old', project: 'p', key: 'PRJ-201' }] };
  const candidate = structuredClone(current);
  candidate.tasks.push({ id: 'one', project: 'p', key: 'PRJ-201' }, { id: 'two', project: 'p', key: 'PRJ-201' });
  assignCanonicalTaskKeys(current, candidate);
  assert.deepEqual(
    candidate.tasks.map(task => task.key),
    ['PRJ-201', 'PRJ-202', 'PRJ-203'],
  );
  assert.equal(candidate.projects[0].seq, 203);
});
