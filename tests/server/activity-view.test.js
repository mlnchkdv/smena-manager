import test from 'node:test';
import assert from 'node:assert/strict';
import { activityMatcher, activityRangeValid } from '../../src/shared/activity-view.js';

test('inverted activity ranges are invalid rather than ordinary empty searches', () => {
  assert.equal(activityRangeValid('2026-11-15', '2026-11-01'), false);
  assert.equal(activityRangeValid('2026-11-01', '2026-11-01'), true);
  assert.equal(activityRangeValid('', '2026-11-01'), true);
  assert.equal(activityRangeValid('2026-11-01', ''), true);
  const matcher = activityMatcher({}, { from: '2026-11-15', to: '2026-11-01' });
  assert.equal(matcher({ at: '2026-11-10T12:00:00Z' }), false);
});
test('activity query and project compose with inclusive calendar dates in selected zone', () => {
  const data = { tasks: [{ id: 't', title: 'Сборка API', project: 'p' }], projects: [{ id: 'p', name: 'Продукт' }] };
  const m = activityMatcher(data, { query: 'API Продукт', project: 'p', from: '2026-11-02', to: '2026-11-02', zone: 'Europe/Saratov' });
  assert.equal(m({ task: 't', at: '2026-11-01T20:00:00Z' }), true);
  assert.equal(m({ task: 't', at: '2026-11-02T19:59:59.999Z' }), true);
  assert.equal(m({ task: 't', at: '2026-11-02T20:00:00Z' }), false);
  assert.equal(m({ task: 't', project: 'other', at: '2026-11-02T12:00:00Z' }), false);
  assert.equal(m({ task: 'removed', at: '2026-11-02T12:00:00Z' }), false);
});
