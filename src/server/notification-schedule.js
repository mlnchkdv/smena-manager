import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
let cached;

// Read-only host status. Never start a timer or invoke the delivery endpoint.
export async function notificationSchedule({ env = process.env, platform = process.platform, run = exec, now = Date.now() } = {}) {
  if (env.SMENA_VPS_MANAGED !== '1' || platform !== 'linux') return { mode: 'external', source: 'hosting' };
  if (run === exec && cached?.until > now) return cached.value;
  let value;
  try {
    const { stdout } = await run('/usr/bin/systemctl', ['show', 'smena-manager-cron.timer', '--property=LoadState,ActiveState,UnitFileState'], {
      timeout: 2000,
      maxBuffer: 4096,
      env: { PATH: '/usr/bin:/bin', LC_ALL: 'C' },
    });
    const fields = Object.fromEntries(
      stdout
        .trim()
        .split('\n')
        .map(line => line.split('=')),
    );
    value =
      fields.LoadState === 'loaded'
        ? {
            mode: fields.ActiveState === 'active' ? 'enabled' : 'disabled',
            source: 'systemd',
            persistent: ['enabled', 'enabled-runtime'].includes(fields.UnitFileState),
          }
        : { mode: 'unknown', source: 'systemd' };
  } catch {
    value = { mode: 'unknown', source: 'systemd' };
  }
  if (run === exec) cached = { until: now + 30000, value };
  return value;
}
