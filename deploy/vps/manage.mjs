import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { setTimeout as delay } from 'node:timers/promises';
import net from 'node:net';
import {
  ROOT,
  MARKER,
  ENV_FILE,
  PROFILE_FILE,
  domainName,
  domainInNginxDump,
  releasePath,
  safeRef,
  loadProtectedEnvironment,
  renderTemplates,
} from './lib.mjs';
import { activateRelease } from './transaction.mjs';
import { verifyBackend, verifyVhost } from './health.mjs';

const CONFIG = '/etc/smena-manager/deploy.json';
const SITE = '/etc/nginx/sites-available/smena-manager.conf';
const ENABLED = '/etc/nginx/sites-enabled/smena-manager.conf';
const APP = 'smena-manager.service';
const TIMER = 'smena-manager-cron.timer';
const CRON = 'smena-manager-cron.service';
const kit = path.dirname(fileURLToPath(import.meta.url));
const configMode = file => (file === '/etc/letsencrypt/renewal-hooks/deploy/smena-manager-nginx.sh' ? 0o755 : 0o644);
const managed = text => text.startsWith(MARKER) || text.startsWith('#!/usr/bin/env bash\n' + MARKER);
const cleanEnv = () => ({ PATH: '/opt/smena-node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', LANG: 'C.UTF-8' });

function command(program, args, { capture = false, allowed = false, env = cleanEnv(), cwd } = {}) {
  const result = spawnSync(program, args, { cwd, env, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit', maxBuffer: 4 * 1024 * 1024 });
  if (result.error || (result.status !== 0 && !allowed)) throw new Error(`Command failed: ${path.basename(program)} (exit ${result.status ?? 'unavailable'}).`);
  return capture ? { code: result.status, text: result.stdout || '' } : result.status;
}
const systemctl = (...args) => command('systemctl', args);
const active = unit => command('systemctl', ['is-active', '--quiet', unit], { allowed: true, capture: true }).code === 0;
const busy = unit =>
  ['active', 'activating', 'deactivating', 'reloading'].includes(
    command('systemctl', ['show', '--property=ActiveState', '--value', unit], { capture: true }).text.trim(),
  );
const portOpen = () =>
  new Promise(resolve => {
    const socket = net.createConnection({ host: '127.0.0.1', port: 3001 });
    socket.setTimeout(1000);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });

async function safeDirectory(directory, mode = 0o755) {
  await fs.mkdir(directory, { recursive: true, mode });
  const info = await fs.lstat(directory);
  if (!info.isDirectory() || info.uid !== 0 || info.mode & 0o022 || (await fs.realpath(directory)) !== directory)
    throw new Error('Deployment directories must be real root-owned directories without group/world write access.');
}
async function atomicFile(file, content, mode = 0o644, gid = 0) {
  const existing = await fs.lstat(file).catch(error => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  });
  if (existing && (!existing.isFile() || existing.uid !== 0)) throw new Error('Refusing to replace an unmanaged file or symlink.');
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, content, { flag: 'wx', mode });
    await fs.chown(temporary, 0, gid);
    await fs.rename(temporary, file);
  } finally {
    await fs.unlink(temporary).catch(() => {});
  }
}
async function writeManaged(files) {
  for (const [file, text] of files) {
    const before = await fs.readFile(file, 'utf8').catch(error => {
      if (error.code !== 'ENOENT') throw error;
      return null;
    });
    if (before !== null && !managed(before)) throw new Error('A target configuration is not managed by this kit. It was not overwritten.');
    await atomicFile(file, text, configMode(file));
  }
}
async function configSnapshot(files) {
  const snapshot = new Map();
  for (const file of files.keys())
    snapshot.set(
      file,
      await fs.readFile(file, 'utf8').catch(error => {
        if (error.code !== 'ENOENT') throw error;
        return null;
      }),
    );
  return snapshot;
}
async function restoreSnapshot(snapshot) {
  for (const [file, text] of snapshot) {
    if (text === null) {
      const current = await fs.readFile(file, 'utf8').catch(() => '');
      if (managed(current)) await fs.unlink(file);
    } else await atomicFile(file, text, configMode(file));
  }
}
async function setReleaseLink(name, target) {
  const link = path.join(ROOT, name);
  const previous = await fs.lstat(link).catch(error => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  });
  if (previous && !previous.isSymbolicLink()) throw new Error('Refusing to replace a non-symlink release selector.');
  if (!target) {
    if (previous) await fs.unlink(link);
    return;
  }
  await validateRelease(target);
  const temporary = path.join(ROOT, `.${name}-${randomUUID()}`);
  try {
    await fs.symlink(target, temporary);
    await fs.rename(temporary, link);
  } finally {
    await fs.unlink(temporary).catch(() => {});
  }
}
async function releaseLink(name) {
  const link = path.join(ROOT, name);
  const info = await fs.lstat(link).catch(error => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  });
  if (!info) return null;
  if (!info.isSymbolicLink()) throw new Error('Release selector is not a symlink.');
  const target = await fs.realpath(link);
  await validateRelease(target);
  return target;
}
async function validateRelease(directory) {
  const id = path.basename(directory);
  if (releasePath(id) !== directory || (await fs.realpath(directory)) !== directory) throw new Error('Release target escaped the managed directory.');
  const info = await fs.lstat(directory);
  if (!info.isDirectory() || info.uid !== 0 || info.mode & 0o022) throw new Error('Release is not immutable/root owned.');
  const meta = JSON.parse(await fs.readFile(path.join(directory, '.smena-release.json'), 'utf8'));
  if (!/^[a-f0-9]{40}$/.test(meta.commit || '') || !id.startsWith(meta.commit + '-')) throw new Error('Invalid release manifest.');
  for (const file of ['dist/index.html', 'dist/app-version.json', '.generated/sanitizer.mjs', 'deploy/vps/start.mjs', 'deploy/vps/preflight.mjs'])
    await fs.access(path.join(directory, file));
  if (JSON.parse(await fs.readFile(path.join(directory, 'dist/app-version.json'), 'utf8')).version !== meta.commit)
    throw new Error('Built frontend version differs from its release manifest.');
  return meta;
}
async function readConfig() {
  const info = await fs.lstat(CONFIG);
  if (!info.isFile() || info.uid !== 0 || info.mode & 0o027) throw new Error('Deployment configuration must be a protected root-owned regular file.');
  const config = JSON.parse(await fs.readFile(CONFIG, 'utf8'));
  config.domain = domainName(config.domain);
  if (config.version !== 1 || !path.isAbsolute(config.source) || !/^\/[a-zA-Z0-9/_.-]+$/.test(config.node))
    throw new Error('Invalid deployment configuration.');
  return config;
}
async function waitForBackend(commit) {
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    try {
      await verifyBackend(commit);
      return;
    } catch {
      await delay(2000);
    }
  }
  throw new Error('Backend readiness timeout.');
}
async function ensureUsers() {
  for (const [user, home] of [
    ['smena', '/var/lib/smena-manager'],
    ['smena-build', '/var/lib/smena-build'],
  ]) {
    if (command('id', ['-u', user], { allowed: true, capture: true }).code !== 0)
      command('useradd', ['--system', '--user-group', '--home-dir', home, '--no-create-home', '--shell', '/usr/sbin/nologin', user]);
    const uid = Number(command('id', ['-u', user], { capture: true }).text.trim());
    const gid = Number(command('id', ['-g', user], { capture: true }).text.trim());
    if (!uid || !gid) throw new Error('Refusing a privileged runtime/build account.');
    await fs.mkdir(home, { recursive: true, mode: 0o750 });
    if ((await fs.lstat(home)).isSymbolicLink() || (await fs.realpath(home)) !== home) throw new Error('Refusing a symlink service home.');
    await fs.chown(home, uid, gid);
    await fs.chmod(home, user === 'smena-build' ? 0o700 : 0o750);
  }
  return Number(command('id', ['-g', 'smena'], { capture: true }).text.trim());
}
async function assertSource(source) {
  source = await fs.realpath(source);
  const root = command('git', ['-c', `safe.directory=${source}`, '-C', source, 'rev-parse', '--show-toplevel'], { capture: true }).text.trim();
  if ((await fs.realpath(root)) !== source) throw new Error('Source must be the repository root.');
  return source;
}
const git = (source, ...args) => command('git', ['-c', `safe.directory=${source}`, '-C', source, ...args], { capture: true });

async function prepareInstall(options) {
  const domain = domainName(options.domain);
  const source = await assertSource(options.source || path.resolve(kit, '../..'));
  const node = process.execPath;
  const previous = await fs.readFile(CONFIG, 'utf8').catch(error => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  });
  if (previous) {
    const config = await readConfig();
    if (config.domain !== domain || config.source !== source) throw new Error('Existing deployment differs. No configuration was overwritten.');
    console.log('Already prepared. Existing environment/profiles/sites were preserved; use update.sh to deploy.');
    return;
  }
  for (const dir of [ROOT, path.join(ROOT, 'releases'), path.join(ROOT, 'shared'), path.join(ROOT, 'shared/assets')]) await safeDirectory(dir);
  const gid = await ensureUsers();
  await safeDirectory('/etc/smena-manager', 0o750);
  await fs.chown('/etc/smena-manager', 0, gid);
  for (const dir of [
    '/etc/nginx/snippets',
    '/etc/nginx/sites-available',
    '/etc/nginx/sites-enabled',
    '/var/www/smena-manager-acme',
    '/etc/letsencrypt/renewal-hooks/deploy',
  ])
    await safeDirectory(dir);
  // Do not take over another site's domain. nginx -T is captured, not logged.
  const dump = command('nginx', ['-T'], { capture: true }).text;
  if (domainInNginxDump(dump, domain)) throw new Error('Nginx already has this domain. Review that site before installation.');
  const files = await renderTemplates(domain, node, { tls: false });
  const snapshot = await configSnapshot(files);
  let enabledCreated = false;
  try {
    if (!(await fs.lstat(ENV_FILE).catch(() => null))) {
      const template = (await fs.readFile(path.join(kit, 'smena.env.example'), 'utf8')).replace('CHANGE_DOMAIN', domain);
      await atomicFile(ENV_FILE, template, 0o640, gid);
    }
    if (!(await fs.lstat(PROFILE_FILE).catch(() => null)))
      await atomicFile(PROFILE_FILE, await fs.readFile(path.join(kit, 'profiles.example.json'), 'utf8'), 0o640, gid);
    await writeManaged(files);
    const enabled = await fs.lstat(ENABLED).catch(() => null);
    if (enabled) throw new Error('A sites-enabled entry already exists. It was not replaced.');
    await fs.symlink(SITE, ENABLED);
    enabledCreated = true;
    command('nginx', ['-t']);
    systemctl('daemon-reload');
    systemctl(active('nginx.service') ? 'reload' : 'start', 'nginx.service');
    await atomicFile(CONFIG, JSON.stringify({ version: 1, domain, source, node }, null, 2) + '\n', 0o640, gid);
  } catch (error) {
    if (enabledCreated) await fs.unlink(ENABLED).catch(() => {});
    await restoreSnapshot(snapshot);
    systemctl('daemon-reload');
    throw error;
  }
  console.log('Prepared challenge-only HTTP site. Application and cron have NOT been started.');
  console.log('Fill /etc/smena-manager/smena.env and access-ids.json; obtain TLS with the documented Certbot webroot command; then run update.sh.');
}

async function extractCommit(config, commit, directory) {
  const archive = spawn('git', ['-c', `safe.directory=${config.source}`, '-C', config.source, 'archive', '--format=tar', commit], {
    env: cleanEnv(),
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const unpack = spawn('runuser', ['-u', 'smena-build', '--', 'tar', '-xf', '-', '--no-same-owner', '--no-same-permissions', '-C', directory], {
    env: cleanEnv(),
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  const exited = child =>
    new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', code => (code === 0 ? resolve() : reject(new Error('Release extraction failed.'))));
    });
  await Promise.all([pipeline(archive.stdout, unpack.stdin), exited(archive), exited(unpack)]);
}
export async function publishAssets(from, to) {
  await fs.mkdir(to, { recursive: true, mode: 0o755 });
  for (const entry of await fs.readdir(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name),
      destination = path.join(to, entry.name);
    if (entry.isDirectory()) await publishAssets(source, destination);
    else if (entry.isFile()) {
      const existing = await fs.lstat(destination).catch(error => {
        if (error.code !== 'ENOENT') throw error;
        return null;
      });
      if (existing) {
        if (!existing.isFile()) throw new Error('Unexpected shared asset type.');
        const hash = bytes => createHash('sha256').update(bytes).digest('hex');
        if (hash(await fs.readFile(source)) !== hash(await fs.readFile(destination))) throw new Error('Immutable asset name collision.');
      } else {
        await fs.copyFile(source, destination, 1);
        await fs.chmod(destination, 0o644);
      }
    } else throw new Error('Symlinks/special files are not allowed in published assets.');
  }
}
async function buildRelease(config, ref, fetchSource) {
  if (fetchSource) {
    const remote = git(config.source, 'remote', 'get-url', 'origin').text.trim();
    if (remote.includes('://') && (new URL(remote).username || new URL(remote).password || new URL(remote).search))
      throw new Error('Use a credential-free remote URL and a protected deploy key.');
    git(config.source, 'fetch', '--prune', 'origin');
  }
  const commit = git(config.source, 'rev-parse', '--verify', '--end-of-options', `${safeRef(ref)}^{commit}`).text.trim();
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('Git ref did not resolve to a commit.');
  const current = await releaseLink('current');
  if (current && (await validateRelease(current)).commit === commit) {
    console.log('This commit is already active. No restart performed.');
    return null;
  }
  const id = `${commit}-${randomUUID()}`;
  const stage = path.join(ROOT, 'releases', `.stage-${id}`);
  const target = releasePath(id);
  await fs.mkdir(stage, { mode: 0o755 });
  const uid = Number(command('id', ['-u', 'smena-build'], { capture: true }).text.trim());
  const gid = Number(command('id', ['-g', 'smena-build'], { capture: true }).text.trim());
  await fs.chown(stage, uid, gid);
  try {
    await extractCommit(config, commit, stage);
    // Never run npm lifecycle scripts or tests with production credentials.
    const env = { ...cleanEnv(), PATH: `${path.dirname(config.node)}:/usr/bin:/bin`, HOME: '/var/lib/smena-build', NODE_OPTIONS: '--max-old-space-size=2048' };
    const npm = path.join(path.dirname(config.node), 'npm');
    for (const args of [
      ['ci', '--include=dev'],
      ['run', 'lint'],
    ])
      command('runuser', ['-u', 'smena-build', '--', npm, ...args], {
        cwd: stage,
        env: { ...env, ...(args.at(-1) === 'build' ? { VERCEL_GIT_COMMIT_SHA: commit } : {}) },
      });
    const tests = (await fs.readdir(path.join(stage, 'tests/server')))
      .filter(name => name.endsWith('.test.js'))
      .sort()
      .map(name => path.join(stage, 'tests/server', name));
    if (!tests.length) throw new Error('Release tests are missing.');
    command('runuser', ['-u', 'smena-build', '--', config.node, '--test', '--test-concurrency=2', ...tests], { cwd: stage, env });
    command('runuser', ['-u', 'smena-build', '--', npm, 'run', 'build'], { cwd: stage, env: { ...env, VERCEL_GIT_COMMIT_SHA: commit } });
    // This directory was created exclusively for this build and is not user data.
    const testData = path.join(stage, '.data');
    if (path.dirname(testData) !== stage || (await fs.realpath(stage)) !== stage) throw new Error('Unsafe test-data cleanup target.');
    await fs.rm(testData, { recursive: true, force: true });
    await fs.writeFile(
      path.join(stage, '.smena-release.json'),
      JSON.stringify({ commit, id, builtAt: new Date().toISOString(), node: process.versions.node }) + '\n',
      { flag: 'wx', mode: 0o644 },
    );
    command('chown', ['-hR', 'root:root', stage]);
    command('chmod', ['-R', 'a-w', stage]);
    await fs.rename(stage, target);
    await validateRelease(target);
    await publishAssets(path.join(target, 'dist/assets'), path.join(ROOT, 'shared/assets'));
    return target;
  } catch (error) {
    // Keep a failed staging directory for inspection; never recursively delete
    // a computed source/release path or touch the production data directory.
    console.error('Build failed. Staging files retained; current release was not switched.');
    throw error;
  }
}

async function switchRelease(config, target, previous) {
  if ((await portOpen()) && !busy(APP)) throw new Error('Port 3001 belongs to an unmanaged process. It was not stopped.');
  const oldPrevious = await releaseLink('previous');
  const targetMeta = await validateRelease(target);
  const previousMeta = previous && (await validateRelease(previous));
  const files = await renderTemplates(config.domain, config.node, { templateDir: pathToFileURL(path.join(target, 'deploy/vps/templates/')) });
  const snapshot = await configSnapshot(files);
  const journal = async status =>
    atomicFile(
      path.join(ROOT, 'deploy-state.json'),
      JSON.stringify({ status, target: path.basename(target), previous: previous && path.basename(previous), at: new Date().toISOString() }, null, 2) + '\n',
      0o600,
    );
  await activateRelease({
    timerActive: async () => active(TIMER),
    stopTimer: async () => systemctl('stop', TIMER),
    startTimer: async () => systemctl('start', TIMER),
    assertCronIdle: async () => {
      if (busy(CRON)) throw new Error('Daily automation is running. Retry deployment after it finishes.');
    },
    journal,
    stopApp: async () => systemctl('stop', APP),
    selectTarget: () => setReleaseLink('current', target),
    installConfig: () => writeManaged(files),
    validateConfig: async () => {
      command('nginx', ['-t']);
      command('systemd-analyze', [
        'verify',
        ...[APP, CRON, TIMER, 'smena-manager-monitor.service', 'smena-manager-monitor.timer'].map(unit => '/etc/systemd/system/' + unit),
      ]);
      systemctl('daemon-reload');
    },
    startApp: async () => systemctl('start', APP),
    backendHealthy: () => waitForBackend(targetMeta.commit),
    reloadNginx: async () => systemctl(active('nginx.service') ? 'reload' : 'start', 'nginx.service'),
    vhostHealthy: () => verifyVhost(config.domain, targetMeta.commit),
    commit: async () => {
      if (target !== previous) await setReleaseLink('previous', previous);
      systemctl('enable', APP);
      systemctl('enable', 'nginx.service');
    },
    restorePrevious: async () => {
      await setReleaseLink('current', previous);
      await setReleaseLink('previous', oldPrevious);
    },
    restoreConfig: () => restoreSnapshot(snapshot),
    recoverApp: async () => {
      if (previous) {
        systemctl('start', APP);
        await waitForBackend(previousMeta.commit);
      } else systemctl('disable', APP);
    },
    recoveredHealthy: async () => {
      if (previous) await verifyVhost(config.domain, previousMeta.commit);
    },
  });
  console.log(`Active release: ${targetMeta.commit}. Google Drive data was not restored or replaced.`);
}
async function deploy(options) {
  const config = await readConfig();
  const { features } = await loadProtectedEnvironment(config.domain);
  console.log(`Protected configuration valid; Gmail=${features.gmail}, Push=${features.push}.`);
  for (const file of ['fullchain.pem', 'privkey.pem']) await fs.access(`/etc/letsencrypt/live/${config.domain}/${file}`);
  const pending = await fs
    .readFile(path.join(ROOT, 'deploy-state.json'), 'utf8')
    .then(JSON.parse)
    .catch(error => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
  if (['switching', 'recovery-failed'].includes(pending?.status))
    throw new Error('Interrupted activation needs an explicit rollback --to RELEASE_ID before another update.');
  const previous = await releaseLink('current');
  if (!previous && !options['acknowledge-single-writer'])
    throw new Error('First activation requires --acknowledge-single-writer after stopping old hosting writes and cron.');
  if (!previous && active(APP)) throw new Error('Unexpected active application without a managed current release.');
  const target = await buildRelease(config, options.ref || 'HEAD', options.fetch);
  if (target) await switchRelease(config, target, previous);
}
async function rollback(options) {
  const config = await readConfig();
  await loadProtectedEnvironment(config.domain);
  const previous = await releaseLink('current');
  const target = options.to ? releasePath(options.to) : await releaseLink('previous');
  if (!target) throw new Error('No previous release. Use --to with a validated retained release ID.');
  if (target === previous && !options.to) {
    console.log('Requested release is already selected.');
    return;
  }
  // An explicit --to also repairs a cutover interrupted after selecting this
  // link but before installing units or starting the process.
  await switchRelease(config, target, previous);
}
async function enableCron(options) {
  if (!options['acknowledge-scheduled-delivery'])
    throw new Error('Use --acknowledge-scheduled-delivery only after disabling old hosting cron. Missed runs may execute immediately.');
  const config = await readConfig();
  await loadProtectedEnvironment(config.domain);
  const current = await releaseLink('current');
  if (!current) throw new Error('Deploy and verify the application first.');
  await verifyVhost(config.domain, (await validateRelease(current)).commit);
  systemctl('enable', '--now', TIMER);
  systemctl('list-timers', TIMER, '--no-pager');
}

export function parseOptions(args) {
  const [action, ...rest] = args;
  const allowed = {
    install: ['domain', 'source'],
    update: ['ref', 'fetch', 'acknowledge-single-writer'],
    rollback: ['to'],
    'enable-cron': ['acknowledge-scheduled-delivery'],
  };
  if (!Object.hasOwn(allowed, action)) throw new Error('Use install, update, rollback or enable-cron.');
  const options = {};
  for (let i = 0; i < rest.length; i++) {
    const key = rest[i].replace(/^--/, '');
    if (!rest[i].startsWith('--') || !allowed[action].includes(key) || Object.hasOwn(options, key))
      throw new Error('Unknown or duplicate deployment argument.');
    if (['fetch', 'acknowledge-single-writer', 'acknowledge-scheduled-delivery'].includes(key)) options[key] = true;
    else {
      options[key] = rest[++i];
      if (!options[key] || options[key].startsWith('--')) throw new Error('Missing deployment argument value.');
    }
  }
  return { action, options };
}
async function main() {
  if (process.platform !== 'linux' || process.getuid() !== 0 || process.versions.node.split('.')[0] !== '22')
    throw new Error('Run as root on Linux with Node.js 22.');
  const { action, options } = parseOptions(process.argv.slice(2));
  if (process.env.SMENA_DEPLOY_LOCKED !== '1') {
    const code = command(
      'flock',
      ['--nonblock', '--no-fork', '/run/lock/smena-manager-deploy.lock', process.execPath, process.argv[1], ...process.argv.slice(2)],
      { allowed: true, env: { ...process.env, SMENA_DEPLOY_LOCKED: '1' } },
    );
    process.exitCode = code;
    return;
  }
  if (action !== 'install') await safeDirectory(ROOT);
  if (action === 'install') await prepareInstall(options);
  else if (action === 'update') await deploy(options);
  else if (action === 'rollback') await rollback(options);
  else await enableCron(options);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
