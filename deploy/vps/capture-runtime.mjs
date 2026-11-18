import fs from 'node:fs/promises';
import path from 'node:path';
import { releasePattern, ROOT } from './lib.mjs';

// Explicit part of the trusted root deployment, never application startup.
// The download runs as the build user; runtime binaries remain root-owned.
export async function provisionCaptureRuntime(stage, node, run) {
  const release = path.basename(stage).replace(/^\.stage-/u, '');
  if (path.dirname(stage) !== `${ROOT}/releases` || !releasePattern.test(release) || !path.isAbsolute(node) || (await fs.realpath(stage)) !== stage)
    throw new Error('Invalid capture release path.');
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
  const cache = '/var/cache/smena-capture';
  await fs.mkdir(cache, { recursive: true, mode: 0o700 });
  const info = await fs.lstat(cache);
  if (!info.isDirectory() || (await fs.realpath(cache)) !== cache) throw new Error('Unsafe capture browser path.');
  run('/usr/bin/chown', ['-hR', 'smena-build:smena-build', cache]);
  run('/usr/bin/chmod', ['-R', 'u+rwX,go+rX', cache]);
  run('/usr/sbin/runuser', [
    '-u',
    'smena-build',
    '--',
    '/usr/bin/env',
    'HOME=/var/lib/smena-build',
    `PLAYWRIGHT_BROWSERS_PATH=${cache}`,
    node,
    cli,
    'install',
    'chromium',
  ]);
  run('/usr/bin/chown', ['-hR', 'root:root', cache]);
  run('/usr/bin/chmod', ['-R', 'a+rX,a-w', cache]);
  // Ubuntu 24.04 requires an executable-specific permission to construct the
  // Chromium sandbox. Do not disable AppArmor or the system-wide userns policy.
  const restricted = await fs.readFile('/proc/sys/kernel/apparmor_restrict_unprivileged_userns', 'utf8').catch(() => '0');
  if (restricted.trim() === '1') {
    const { browsers } = JSON.parse(await fs.readFile(path.join(stage, 'node_modules/playwright-core/browsers.json'), 'utf8'));
    const entries = [
      ['chromium', 'chromium', 'chrome-linux64/chrome'],
      ['chromium-headless-shell', 'chromium_headless_shell', 'chrome-headless-shell-linux64/chrome-headless-shell'],
    ];
    const profiles = [];
    for (const [name, directory, suffix] of entries) {
      const revision = browsers.find(browser => browser.name === name)?.revision;
      if (!/^\d+$/u.test(revision || '')) throw new Error('Invalid capture browser revision.');
      const executable = `${cache}/${directory}-${revision}/${suffix}`;
      if ((await fs.realpath(executable)) !== executable) throw new Error('Unsafe browser executable.');
      profiles.push(`${executable} flags=(unconfined) {\n  userns,\n}`);
    }
    const profile = '/etc/apparmor.d/smena-capture';
    await fs.writeFile(profile, 'abi <abi/4.0>,\ninclude <tunables/global>\n' + profiles.join('\n') + '\n', { mode: 0o644 });
    run('/usr/sbin/apparmor_parser', ['-r', profile]);
  }
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
