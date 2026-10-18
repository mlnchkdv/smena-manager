import assert from 'node:assert/strict';
import test from 'node:test';
import { assignCanonicalTaskKeys, validateTaskTransitions } from '../../src/server/task-integrity.js';
import { calendarDate, nextRecurrenceDate, resolveTimeZone, formatTimestamp } from '../../src/shared/calendar-time.js';

test('timestamps honor the selected time zone and 12/24-hour preference', () => {
  const instant = '2026-10-18T12:30:00Z';
  assert.equal(formatTimestamp(instant, { locale: 'en-US', timeZone: 'Europe/Saratov', timeFormat: '24', timeOnly: true }), '16:30');
  assert.match(formatTimestamp(instant, { locale: 'en-US', timeZone: 'Europe/Saratov', timeFormat: '12', timeOnly: true }), /4:30.*PM/u);
  assert.equal(formatTimestamp(instant, { locale: 'ru-RU', timeZone: 'UTC', timeOnly: true }), '12:30');
  assert.equal(formatTimestamp('broken'), '—');
});

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

test('project prefixes and task keys remain unique across projects, including legacy duplicate prefixes', () => {
  const current = {
    projects: [
      { id: 'a', key: 'PRJ', seq: 1 },
      { id: 'b', key: 'PRJ', seq: 0 },
    ],
    tasks: [{ id: 'old', project: 'a', key: 'PRJ-1' }],
  };
  const next = structuredClone(current);
  next.projects.push({ id: 'new-project', key: 'PRJ', seq: 999999 });
  next.tasks.push({ id: 'new-task', project: 'b' }, { id: 'other-task', project: 'new-project' });
  assignCanonicalTaskKeys(current, next);
  assert.equal(next.projects[2].key, 'PRJ-2');
  assert.equal(next.tasks[1].key, 'PRJ-2');
  assert.equal(next.tasks[2].key, 'PRJ-2-1');
  assert.equal(next.projects[2].seq, 1);
  assert.equal(new Set(next.tasks.map(task => task.key)).size, next.tasks.length);
});
