import test from 'node:test';
import assert from 'node:assert/strict';
import { notificationSchedule } from '../../src/server/notification-schedule.js';
test('schedule diagnostics only read the managed timer and never enable or send', async () => {
  for (const active of ['active', 'inactive']) {
    const value = await notificationSchedule({
      platform: 'linux',
      env: { SMENA_VPS_MANAGED: '1' },
      run: async (bin, args, options) => {
        assert.equal(bin, '/usr/bin/systemctl');
        assert.deepEqual(args, ['show', 'smena-manager-cron.timer', '--property=LoadState,ActiveState,UnitFileState']);
        assert.equal(options.timeout, 2000);
        return { stdout: `LoadState=loaded\nActiveState=${active}\nUnitFileState=disabled\n` };
      },
    });
    assert.equal(value.mode, active === 'active' ? 'enabled' : 'disabled');
    assert.equal(value.persistent, false);
  }
  const config = {
    platform: 'linux',
    env: { SMENA_VPS_MANAGED: '1' },
    run: async () => {
      throw Error('private provider details');
    },
  };
  assert.deepEqual(await notificationSchedule(config), { mode: 'unknown', source: 'systemd' });
  assert.deepEqual(await notificationSchedule({ ...config, env: {} }), { mode: 'external', source: 'hosting' });
});
