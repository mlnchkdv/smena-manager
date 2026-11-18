import fs from 'node:fs/promises';
import path from 'node:path';

// Explicit part of the trusted root deployment, never application startup.
// The browser download and execution run as the unprivileged application user.
export async function provisionCaptureRuntime(stage, node, run) {
  if (!/^\/srv\/smena-manager\/releases\/\.stage-[a-f0-9-]+$/u.test(stage) || !path.isAbsolute(node)) throw new Error('Invalid capture staging path.');
  const { version } = JSON.parse(await fs.readFile(path.join(stage, 'node_modules/playwright/package.json'), 'utf8'));
  if (!/^\d+\.\d+\.\d+$/u.test(version)) throw new Error('Invalid capture dependency version.');
  const marker = '/etc/smena-manager/capture-runtime.json';
  let installed;
  try {
    const info = await fs.lstat(marker);
    if (!info.isFile() || info.uid !== 0 || info.mode & 0o022) throw new Error('Untrusted capture marker.');
    installed = JSON.parse(await fs.readFile(marker, 'utf8')).version;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const cli = path.join(stage, 'node_modules/playwright/cli.js');
  if (installed !== version) run(node, [cli, 'install-deps', 'chromium']);
  const cache = '/var/lib/smena-manager/browsers';
  await fs.mkdir(cache, { recursive: true, mode: 0o700 });
  const info = await fs.lstat(cache);
  if (!info.isDirectory() || (await fs.realpath(cache)) !== cache) throw new Error('Unsafe capture browser path.');
  run('/usr/bin/chown', ['smena:smena', cache]);
  run('/usr/sbin/runuser', [
    '-u',
    'smena',
    '--',
    '/usr/bin/env',
    'HOME=/var/lib/smena-manager',
    `PLAYWRIGHT_BROWSERS_PATH=${cache}`,
    node,
    cli,
    'install',
    'chromium',
  ]);
  run('/usr/bin/systemd-run', [
    '--quiet',
    '--wait',
    '--pipe',
    '--collect',
    '--property=User=smena',
    '--property=Group=smena',
    '--property=NoNewPrivileges=true',
    '--property=PrivateTmp=true',
    '--property=ProtectHome=true',
    '--property=MemoryMax=1G',
    '--property=TasksMax=256',
    '--property=RuntimeMaxSec=60',
    '--setenv=HOME=/var/lib/smena-manager',
    `--setenv=PLAYWRIGHT_BROWSERS_PATH=${cache}`,
    '--setenv=SMENA_TEST_RENDER=1',
    '--',
    node,
    '--test',
    path.join(stage, 'tests/server/bookmark-render.test.js'),
  ]);
  await fs.writeFile(marker, JSON.stringify({ version }) + '\n', { mode: 0o600 });
}
