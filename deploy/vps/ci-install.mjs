import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CI_DIRECTORY, CI_USER } from './ci-policy.mjs';

const marker = '# Managed by Smena Manager CI';
const home = '/var/lib/smena-deploy';
function command(program, args, allowed = false) {
  const result = spawnSync(program, args, { encoding: 'utf8', env: { PATH: '/usr/sbin:/usr/bin:/sbin:/bin' } });
  if (result.error || (!allowed && result.status !== 0)) throw new Error(`CI installation failed: ${program}.`);
  return result;
}
async function directory(target, mode) {
  await fs.mkdir(target, { recursive: true, mode });
  const info = await fs.lstat(target);
  if (!info.isDirectory() || (await fs.realpath(target)) !== target) throw new Error('Refusing a linked CI directory.');
  await fs.chown(target, 0, 0);
  await fs.chmod(target, mode);
}
async function managedFile(target, value, mode) {
  const info = await fs.lstat(target).catch(error => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  });
  if (info && (!info.isFile() || info.uid !== 0 || !(await fs.readFile(target, 'utf8')).startsWith(marker)))
    throw new Error('Refusing to overwrite unmanaged CI configuration.');
  const temporary = `${target}.smena-ci-tmp`;
  await fs.writeFile(temporary, value, { flag: 'wx', mode });
  await fs.chown(temporary, 0, 0);
  await fs.rename(temporary, target);
}
async function main() {
  if (process.platform !== 'linux' || process.getuid() !== 0 || process.argv.length !== 3)
    throw new Error('Usage: sudo /opt/smena-node/bin/node deploy/vps/ci-install.mjs /protected/deploy.pub');
  const key = (await fs.readFile(process.argv[2], 'utf8')).trim();
  if (!/^ssh-ed25519 [A-Za-z0-9+/]{40,}={0,3}(?: [a-zA-Z0-9._@-]+)?$/.test(key)) throw new Error('Expected one Ed25519 public key.');
  const account = command('getent', ['passwd', CI_USER], true);
  if (account.status === 0) {
    const fields = account.stdout.trim().split(':');
    if (fields[2] === '0' || fields[5] !== home || fields[6] !== '/bin/sh') throw new Error('An existing CI user has unexpected settings.');
  } else command('useradd', ['--system', '--create-home', '--home-dir', home, '--shell', '/bin/sh', CI_USER]);
  await directory(home, 0o755);
  await directory(`${home}/.ssh`, 0o755);
  await directory(CI_DIRECTORY, 0o755);
  for (const name of ['ci-policy.mjs', 'ci-entry.mjs', 'ci-server.mjs']) {
    const target = `${CI_DIRECTORY}/${name}`;
    const info = await fs.lstat(target).catch(error => {
      if (error.code !== 'ENOENT') throw error;
      return null;
    });
    if (info && (!info.isFile() || info.uid !== 0)) throw new Error('Unexpected CI program owner/type.');
    await fs.writeFile(target, await fs.readFile(path.join(path.dirname(fileURLToPath(import.meta.url)), name)), { mode: 0o644 });
    await fs.chmod(target, 0o644);
  }
  const sudoFile = '/etc/sudoers.d/smena-manager-ci';
  const sudoText = `${marker}\n${CI_USER} ALL=(root) NOPASSWD: /opt/smena-node/bin/node ${CI_DIRECTORY}/ci-server.mjs *\n`;
  const review = '/etc/sudoers.d/.smena-manager-ci-review';
  await fs.writeFile(review, sudoText, { flag: 'wx', mode: 0o440 });
  try {
    command('visudo', ['-cf', review]);
  } finally {
    await fs.unlink(review);
  }
  await managedFile(sudoFile, sudoText, 0o440);
  await managedFile(`${home}/.ssh/authorized_keys`, `${marker}\nrestrict,command="/opt/smena-node/bin/node ${CI_DIRECTORY}/ci-entry.mjs" ${key}\n`, 0o644);
  console.log('Restricted CI account installed. No application secrets, services, SSH daemon settings or data were changed.');
}
main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
