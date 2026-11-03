import test from 'node:test';
import assert from 'node:assert/strict';
import { activityGroups } from '../../src/shared/activity-groups.js';
test('numeric production timestamps group and invalid timestamps stay individual', () => {
  const at = Date.UTC(2026, 10, 3, 10);
  const first = { id: 'a', task: 't', by: 'u', verb: 'completed', at };
  const second = { ...first, id: 'b', at: at - 60000 };
  assert.equal(activityGroups([first, second], { enabled: true })[0].events.length, 2);
  assert.equal(activityGroups([first, { ...second, at: 'invalid' }], { enabled: true }).length, 2);
});
test('activity grouping preserves every event and stops at actor, object, workspace, time and alert boundaries', () => {
  const base = { workspace: 'w', project: 'p', task: 't', by: 'a', verb: 'completed a subtask in', at: '2026-11-03T10:00:00Z' };
  const events = [
    base,
    { ...base, id: 'b', at: '2026-11-03T09:59:00Z' },
    { ...base, by: 'b' },
    { ...base, workspace: 'other' },
    { ...base, task: 'other' },
    { ...base, at: '2026-11-03T09:50:00Z' },
    { ...base, verb: 'commented on' },
    { ...base, type: 'security' },
    { ...base, read: false },
  ];
  const result = activityGroups(events, { enabled: true });
  assert.equal(result[0].events.length, 2);
  assert.deepEqual(
    result.flatMap(g => g.events),
    events,
  );
  assert.equal(result.length, 8);
  assert.equal(activityGroups(events).length, events.length);
  assert.equal(events[0], base);
  assert.equal(activityGroups([base, { ...base, at: '2026-11-02T23:59:00Z' }], { enabled: true }).length, 2);
});
