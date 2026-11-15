import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

async function main() {
  const { SMENA_VPS_HOST: host, SMENA_VPS_KNOWN_HOSTS: knownHosts, SMENA_VPS_SSH_KEY: key, GITHUB_SHA: sha } = process.env;
  const port = process.env.SMENA_VPS_PORT || '22';
  if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(host || '') || !/^\d{1,5}$/.test(port) || +port < 1 || +port > 65535 || !/^[a-f0-9]{40}$/.test(sha || ''))
    throw new Error('Missing or invalid CI host, port or commit.');
  if (!knownHosts?.trim() || !key?.startsWith('-----BEGIN OPENSSH PRIVATE KEY-----')) throw new Error('Missing pinned host key or deployment credential.');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'smena-ci-'));
  try {
    const keyFile = path.join(directory, 'key'),
      hostsFile = path.join(directory, 'known_hosts');
    await fs.writeFile(keyFile, key.endsWith('\n') ? key : key + '\n', { mode: 0o600 });
    await fs.writeFile(hostsFile, knownHosts.trim() + '\n', { mode: 0o600 });
    let tail = '';
    const code = await new Promise((resolve, reject) => {
      const child = spawn(
        'ssh',
        [
          '-T',
          '-o',
          'BatchMode=yes',
          '-o',
          'IdentitiesOnly=yes',
          '-o',
          'StrictHostKeyChecking=yes',
          '-o',
          `UserKnownHostsFile=${hostsFile}`,
          '-o',
          'ConnectTimeout=15',
          '-o',
          'ServerAliveInterval=20',
          '-o',
          'ServerAliveCountMax=6',
          '-i',
          keyFile,
          '-p',
          port,
          `smena-deploy@${host}`,
          `deploy ${sha}`,
        ],
        { stdio: ['ignore', 'pipe', 'inherit'] },
      );
      child.stdout.on('data', chunk => {
        process.stdout.write(chunk);
        tail = (tail + chunk.toString()).slice(-32768);
      });
      child.on('error', reject);
      child.on('close', resolve);
    });
    if (code !== 0) throw new Error(`Server publication failed (SSH exit ${code}). See the deployment log; the standard updater handles activation rollback.`);
    const line = tail.split('\n').findLast(value => value.startsWith('SMENA_CI_RESULT '));
    if (!line) throw new Error('The server did not confirm deployment.');
    const result = JSON.parse(line.slice('SMENA_CI_RESULT '.length));
    if (!['deployed', 'superseded'].includes(result.status)) throw new Error('Unexpected server publication status.');
    if (result.status === 'deployed') {
      for (const endpoint of ['/api/health', '/app-version.json']) {
        const response = await fetch('https://smena.team' + endpoint, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20000) });
        const data = await response.json();
        if (!response.ok || (endpoint === '/api/health' ? data.status !== 'ok' || data.release !== sha : data.version !== sha))
          throw new Error('Public frontend/backend release verification failed.');
      }
    }
    if (process.env.GITHUB_STEP_SUMMARY)
      await fs.appendFile(
        process.env.GITHUB_STEP_SUMMARY,
        `### smena.team\n\n${result.status === 'deployed' ? 'Published and verified' : 'Skipped because a newer main commit exists'}: \`${sha}\`.\n`,
      );
  } finally {
    await fs.unlink(path.join(directory, 'key')).catch(() => {});
    await fs.unlink(path.join(directory, 'known_hosts')).catch(() => {});
    await fs.rmdir(directory);
  }
}
main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
