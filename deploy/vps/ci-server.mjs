import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { checkedCiDeployment, parseCiCommand, CI_REPOSITORY } from './ci-policy.mjs';

const source = '/srv/smena-manager-source';
const node = '/opt/smena-node/bin/node';
const environment = { PATH: '/opt/smena-node/bin:/usr/sbin:/usr/bin:/sbin:/bin', LANG: 'C.UTF-8', HOME: '/root', GIT_TERMINAL_PROMPT: '0' };
function run(program, args, { capture = false, allowed = false, env = environment } = {}) {
  const result = spawnSync(program, args, { env, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit', maxBuffer: 2 * 1024 * 1024 });
  if (result.error || (result.status !== 0 && !allowed)) throw new Error(`CI command failed: ${program} (exit ${result.status ?? 'unavailable'}).`);
  return result;
}
const git = (...args) => run('/usr/bin/git', ['-c', 'core.hooksPath=/dev/null', '-c', `safe.directory=${source}`, '-C', source, ...args], { capture: true });
async function protectedPath(file, directory = false) {
  const info = await fs.lstat(file);
  if (info.uid !== 0 || info.mode & 0o022 || (directory ? !info.isDirectory() : !info.isFile()) || (await fs.realpath(file)) !== file)
    throw new Error('CI configuration and source must be root-owned, real paths without group/world write access.');
}
async function health() {
  const response = await fetch('http://127.0.0.1:3001/api/health', { signal: AbortSignal.timeout(10000), redirect: 'error' });
  const data = await response.json();
  if (!response.ok || data.status !== 'ok' || !/^[a-f0-9]{40}$/.test(data.release)) throw new Error('The application is not healthy.');
  return data.release;
}
async function main() {
  if (process.platform !== 'linux' || process.getuid() !== 0 || process.versions.node.split('.')[0] !== '22')
    throw new Error('Run through the configured CI sudo entry.');
  if (process.argv.length !== 3) throw new Error('Exactly one CI request is required.');
  const argument = process.argv[2];
  const request = parseCiCommand(argument === 'status' ? argument : `deploy ${argument}`);
  if (process.env.SMENA_CI_LOCKED !== '1') {
    const result = run('/usr/bin/flock', ['--wait', '900', '--no-fork', '/run/lock/smena-manager-deploy.lock', node, process.argv[1], argument], {
      allowed: true,
      env: { ...environment, SMENA_CI_LOCKED: '1' },
    });
    process.exitCode = result.status ?? 1;
    return;
  }
  await protectedPath('/etc/smena-manager/deploy.json');
  const config = JSON.parse(await fs.readFile('/etc/smena-manager/deploy.json', 'utf8'));
  if (config.version !== 1 || config.source !== source || (config.node !== node && config.node !== (await fs.realpath(node))))
    throw new Error('CI does not match the installed deployment configuration.');
  await protectedPath(source, true);
  await protectedPath(`${source}/.git`, true);
  if (git('remote', 'get-url', 'origin').stdout.trim() !== CI_REPOSITORY) throw new Error('Unexpected source repository.');
  const result =
    request.action === 'status'
      ? { status: 'ready', commit: await health() }
      : await checkedCiDeployment(request.sha, {
          clean: async () => !git('status', '--porcelain').stdout.trim(),
          fetchMain: async () => git('fetch', '--no-tags', 'origin', '+refs/heads/main:refs/remotes/origin/main'),
          mainCommit: async () => git('rev-parse', 'refs/remotes/origin/main').stdout.trim(),
          fastForwardAllowed: async sha =>
            run('/usr/bin/git', ['-C', source, 'merge-base', '--is-ancestor', 'HEAD', sha], { capture: true, allowed: true }).status === 0,
          fastForward: async sha => git('merge', '--ff-only', sha),
          deploy: async sha => run(node, [`${source}/deploy/vps/manage.mjs`, 'update', '--ref', sha], { env: { ...environment, SMENA_DEPLOY_LOCKED: '1' } }),
          verify: async sha => {
            if ((await health()) !== sha) throw new Error('The active backend does not match the requested commit.');
          },
        });
  console.log('SMENA_CI_RESULT ' + JSON.stringify(result));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
