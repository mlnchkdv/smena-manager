import test from 'node:test';
import assert from 'node:assert/strict';
import { activityPresetFilters } from '../../src/shared/activity-presets.js';
test('saved relative activity periods roll forward and inaccessible filters are discarded', () => {
  const filters = { actPeriod: '7', actProject: 'hidden', actWho: 'removed', actFilter: 'comments' };
  const first = activityPresetFilters(filters, { today: '2026-11-18', projectIds: [], memberIds: [] });
  assert.equal(first.actFrom, '2026-11-12');
  assert.equal(first.actTo, '2026-11-18');
  assert.equal(first.actProject, 'all');
  assert.equal(first.actWho, 'all');
  assert.equal(activityPresetFilters(filters, { today: '2026-11-19', projectIds: [], memberIds: [] }).actFrom, '2026-11-13');
});
