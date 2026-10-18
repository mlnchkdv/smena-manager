import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

test('serverless API boots when CommonJS require(ESM) is unavailable', () => {
  const result = execFileSync(
    process.execPath,
    ['--no-experimental-require-module', '--input-type=module', '-e', "await import('./api/index.js'); console.log('bootstrap-ok')"],
    { cwd: new URL('../../', import.meta.url), encoding: 'utf8', timeout: 15000, env: { ...process.env, VERCEL: '1' } },
  );
  assert.match(result, /bootstrap-ok/);
});
