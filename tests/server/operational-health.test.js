import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateOperationalHealth } from '../../src/server/operational-health.js';

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
