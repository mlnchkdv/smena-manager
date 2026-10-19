import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateAutomationRun, evaluateOperationalHealth, nextScheduledCronAt } from '../../src/server/operational-health.js';

test('partial file cleanup failures degrade cron status and produce actionable administrator alerts', () => {
  assert.deepEqual(evaluateAutomationRun({}), { status: 'ok', issues: [] });
  for (const failure of [{ failed: 1 }, { error: 'storage_unavailable' }]) {
    assert.deepEqual(evaluateAutomationRun({ fileCleanup: failure }), { status: 'degraded', issues: ['File cleanup failed'] });
    assert.deepEqual(evaluateAutomationRun({ abandonedUploads: failure }), { status: 'degraded', issues: ['Abandoned upload cleanup failed'] });
  }
});

const healthyInput = {
  workspace: { storage: { connected: true, persistent: true }, coordination: { healthy: true } },
  channels: { email: { configured: true, authorized: true }, push: { configured: true } },
  delivery: {
    lastCron: { at: '2026-10-18T08:00:00.000Z', status: 'ok' },
    lastRun: { push: { failed: 0 }, email: { failed: 0 } },
  },
};

test('operational health reports a healthy production pipeline', () => {
  const result = evaluateOperationalHealth(healthyInput, { now: '2026-10-18T12:00:00.000Z' });
  assert.equal(result.status, 'healthy');
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.schedule, { timezone: 'UTC', dailyAt: '04:00', nextRunAt: '2026-10-19T04:00:00.000Z' });
});

test('next scheduled cron is deterministic around the daily boundary', () => {
  assert.equal(nextScheduledCronAt('2026-10-18T03:59:59.000Z'), '2026-10-18T04:00:00.000Z');
  assert.equal(nextScheduledCronAt('2026-10-18T04:00:00.000Z'), '2026-10-19T04:00:00.000Z');
});

test('operational health detects stale cron, storage, coordination, and delivery failures', () => {
  const result = evaluateOperationalHealth(
    {
      workspace: { storage: { connected: false, persistent: false }, coordination: { healthy: false } },
      channels: { email: { configured: false, authorized: false }, push: { configured: false } },
      delivery: {
        lastCron: { at: '2026-10-15T08:00:00.000Z', status: 'ok' },
        lastRun: { push: { failed: 2 }, email: { failed: 1 } },
      },
    },
    { now: '2026-10-18T12:00:00.000Z' },
  );
  assert.equal(result.status, 'critical');
  assert.deepEqual(
    result.issues.map(issue => issue.code),
    ['storage', 'coordination', 'email', 'push', 'cron_stale', 'delivery'],
  );
});
