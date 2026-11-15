import { spawnSync } from 'node:child_process';
import { parseCiCommand, CI_DIRECTORY } from './ci-policy.mjs';

try {
  const request = parseCiCommand(process.env.SSH_ORIGINAL_COMMAND);
  const result = spawnSync('/usr/bin/sudo', ['-n', '/opt/smena-node/bin/node', `${CI_DIRECTORY}/ci-server.mjs`, request.sha || 'status'], {
    stdio: 'inherit',
    env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' },
  });
  process.exitCode = result.status ?? 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 64;
}
