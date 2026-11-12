import test from 'node:test';
import assert from 'node:assert/strict';
import { probeMonitor, hostMemory } from '../../deploy/vps/monitor.mjs';
import { monitorAuthorized } from '../../src/server/monitor-readiness.js';
test('monitor is loopback-only, independently keyed and does not conflate HTTP 200 with readiness', async () => {
  const secret = 'synthetic-monitor-key-at-least-32-characters';
  const request = { socket: { remoteAddress: '127.0.0.1' }, get: () => 'Bearer ' + secret };
  assert.equal(monitorAuthorized(request, { MONITOR_SECRET: secret }), true);
  assert.equal(monitorAuthorized({ ...request, socket: { remoteAddress: '203.0.113.10' } }, { MONITOR_SECRET: secret }), false);
  assert.equal(monitorAuthorized(request, { CRON_SECRET: secret }), false);
  const calls = [];
  const options = {
    secret,
    disk: async () => ({ bavail: 10 * 1024 ** 3, bsize: 1 }),
    memory: () => ({ available: 2e9, total: 8e9 }),
    fetcher: async url => {
      calls.push(url);
      return Response.json({ status: url.endsWith('/health') ? 'ok' : 'degraded', issues: ['backup_stale'] });
    },
  };
  assert.deepEqual((await probeMonitor(options)).issues, ['backup_stale', 'readiness_degraded']);
  assert.equal(
    calls.some(url => /cron|retry|restore/.test(url)),
    false,
  );
  assert.equal((await probeMonitor({ ...options, fetcher: async url => Response.json({ status: url.endsWith('/health') ? 'ok' : 'ready' }) })).ok, true);
  assert.equal((await probeMonitor({ ...options, disk: async () => ({ bavail: 1, bsize: 1 }) })).issues.includes('disk_low'), true);
});

test('Linux monitoring uses reclaimable MemAvailable instead of free pages; unreadable data remains unknown', async () => {
  const options = { platform: 'linux', total: 8 * 1024 ** 3, free: () => 0, read: async () => 'MemFree:        1 kB\nMemAvailable:  4194304 kB\n' };
  assert.equal((await hostMemory(options)).available, 4 * 1024 ** 3);
  assert.equal(
    (
      await hostMemory({
        ...options,
        read: async () => {
          throw Error('unavailable');
        },
      })
    ).available,
    null,
  );
  assert.equal((await hostMemory({ ...options, read: async () => 'MemAvailable: 999999999999999999999 kB' })).available, null);
});
