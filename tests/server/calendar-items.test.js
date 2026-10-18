import assert from 'node:assert/strict';
import test from 'node:test';
import { calendarDayItems } from '../../src/shared/calendar-items.js';

const date = '2026-10-18';
const tasks = [
  { id: 'visible', project: 'a', due: date },
  { id: 'other-project', project: 'b', due: date },
  { id: 'other-date', project: 'a', due: '2026-10-19' },
];
const events = [
  { id: 'event', project: 'a', date },
  { id: 'foreign-event', project: 'b', date },
];

test('project calendar overflow excludes other projects and dates', () => {
  assert.deepEqual(calendarDayItems(tasks, events, date, 'a'), [{ ev: events[0] }, { t: tasks[0] }]);
});

test('overflow honors the already-filtered task set without reintroducing excluded tasks', () => {
  assert.deepEqual(calendarDayItems([], events, date, 'a'), [{ ev: events[0] }]);
  assert.deepEqual(calendarDayItems([tasks[0]], [], date, 'a'), [{ t: tasks[0] }]);
});

test('workspace calendar includes matching items across projects, events first', () => {
  assert.deepEqual(calendarDayItems(tasks, events, date), [{ ev: events[0] }, { ev: events[1] }, { t: tasks[0] }, { t: tasks[1] }]);
});
