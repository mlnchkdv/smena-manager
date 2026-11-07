import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Local acceptance only. This command never deploys, invokes cron or sends mail.
if (Number(process.versions.node.split('.')[0]) !== 22) throw new Error('Local release checks require Node 22.x.');
const args = process.argv.slice(2);
if (args.some(arg => arg !== '--reuse-server-tests')) throw new Error('Supported option: --reuse-server-tests (report tests as not run in this invocation).');
const root = process.cwd(),
  runId = new Date().toISOString().replace(/[:.]/g, '-');
const directory = path.join(root, 'output', 'release-checks', runId),
  dist = path.join(directory, 'dist');
await mkdir(directory, { recursive: true });
const env = { ...process.env, NODE_ENV: 'test', DOTENV_CONFIG_PATH: path.join(directory, 'no-external-env'), SMENA_TEST_MODE: 'true' };
const testConcurrency = 4;
for (const key of Object.keys(env))
  if (
    /^(GOOGLE_|GMAIL_|VAPID_|REDIS_|VERCEL|ACCESS_IDS_|SESSION_SECRET|CRON_SECRET|DATABASE_PATH|UPLOADS_PATH|BACKUPS_PATH|APP_ORIGIN|WORKSPACE_WRITE_MODE)/.test(
      key,
    )
  )
    env[key] = '';
const report = {
  schemaVersion: 1,
  startedAt: new Date().toISOString(),
  node: process.version,
  scope: 'isolated local code checks',
  testConcurrency,
  checks: [],
  status: 'running',
  browser: { status: 'not-run', reason: 'Run the CLI browser matrix separately; this command does not infer UI acceptance from a build.' },
  production: { status: 'not-run' },
  physicalDevices: { status: 'not-run' },
};
const record = () => writeFile(path.join(directory, 'report.json'), JSON.stringify(report, null, 2));
const check = async (name, command, environment = env) => {
  const log = createWriteStream(path.join(directory, name + '.log'));
  const startedAt = Date.now();
  console.log('Checking ' + name + '…');
  const result = await new Promise(resolve => {
    const child = spawn(process.execPath, command, { cwd: root, env: environment, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    child.once('error', error => resolve({ code: null, error: error.message }));
    child.once('close', code => resolve({ code }));
  });
  await new Promise(resolve => log.end(resolve));
  report.checks.push({
    name,
    status: result.code === 0 ? 'passed' : 'failed',
    durationMs: Date.now() - startedAt,
    ...(result.error ? { error: result.error } : {}),
  });
  await record();
  if (result.code !== 0) throw new Error(name + ' failed; review its local log.');
};
try {
  await check('lint', ['node_modules/eslint/bin/eslint.js', 'src', 'scripts', 'tests', 'vite.config.js']);
  await check('ui-tokens', ['scripts/check-ui-tokens.js']);
  if (args.includes('--reuse-server-tests')) {
    report.checks.push({ name: 'server-shared', status: 'not-run', reason: 'Explicitly reused an earlier run. Its evidence must be reviewed separately.' });
    await record();
  } else {
    const tests = (await readdir(path.join(root, 'tests', 'server')))
      .filter(name => name.endsWith('.test.js'))
      .sort()
      .map(name => path.join('tests', 'server', name));
    await check('server-shared', ['--test', '--test-concurrency=' + testConcurrency, ...tests]);
  }
  await check('production-build', ['node_modules/vite/bin/vite.js', 'build', '--outDir', dist], { ...env, NODE_ENV: 'production' });
  await check('startup-budget', ['scripts/check-bundle-size.js', dist]);
  const manifest = await readFile(path.join(dist, '.vite', 'manifest.json'));
  report.buildManifestHash = createHash('sha256').update(manifest).digest('hex');
  report.status = report.checks.some(check => check.status === 'not-run') ? 'partial' : 'local-code-passed';
  if (report.status === 'partial') process.exitCode = 2;
} catch (error) {
  report.status = 'failed';
  report.error = error.message;
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  await record();
  console.log(
    JSON.stringify({
      status: report.status,
      report: path.relative(root, path.join(directory, 'report.json')),
      browser: report.browser.status,
      production: report.production.status,
      physicalDevices: report.physicalDevices.status,
    }),
  );
}
