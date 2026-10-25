import { spawnSync } from 'node:child_process';
import path from 'node:path';
const result = spawnSync(
  process.execPath,
  [
    path.resolve('node_modules/@playwright/test/cli.js'),
    'test',
    'tests/e2e/workspace-smoke.spec.js',
    '--grep',
    'Russian workspace remains usable',
    '--project=chromium',
    '--project=firefox',
    '--project=webkit',
    ...process.argv.slice(2),
  ],
  { stdio: 'inherit', env: { ...process.env, E2E_EXTENDED_BROWSERS: 'true' } },
);
if (result.error) {
  console.error(result.error.message);
  process.exitCode = 1;
} else process.exitCode = result.status ?? 1;
