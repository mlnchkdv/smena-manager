import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { domainName } from './lib.mjs';
import { verifyBackend, verifyVhost } from './health.mjs';

const units = ['smena-manager.service', 'smena-manager-cron.service', 'smena-manager-cron.timer'];
const command = (program, args) => {
  const result = spawnSync(program, args, { encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 });
  if (result.error || result.status !== 0) throw Error(`Host check failed: ${program}. Inspect its service journal locally.`);
  return result.stdout || '';
};
export async function inspectHost({ domain, commit, run = command, fetcher = fetch, backend = verifyBackend, vhost = verifyVhost }) {
  domain = domainName(domain);
  if (!/^[a-f0-9]{40}$/.test(commit || '')) throw Error('Use the expected full release SHA.');
  run('nginx', ['-t']);
  run('systemd-analyze', ['verify', ...units.map(unit => '/etc/systemd/system/' + unit)]);
  const service = run('systemctl', ['show', 'smena-manager.service', '--property=ActiveState,SubState,MainPID']);
  if (!/^ActiveState=active$/m.test(service) || !/^SubState=running$/m.test(service) || !/^MainPID=[1-9][0-9]*$/m.test(service))
    throw Error('The managed API service is not running.');
  if (run('systemctl', ['list-units', '--no-legend', '--plain', '--state=active', 'smena-manager@*.service']).trim())
    throw Error('Multiple managed API instances are not supported for direct Drive writes.');
  await backend(commit);
  await vhost(domain, commit);
  for (const origin of ['https://oauth2.googleapis.com', 'https://www.googleapis.com', 'https://accounts.google.com']) {
    const response = await fetcher(origin, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(10000) });
    await response.body?.cancel();
    // 404/405 are valid reachability evidence, never OAuth/Drive authorization evidence.
    if (response.status < 200 || response.status >= 500) throw Error('Google HTTPS egress failed.');
  }
  return {
    configuration: 'valid',
    managedWriter: 'one active service',
    release: commit,
    tlsVhost: true,
    googleHttpsReachable: true,
    googleAuthorization: 'not checked',
    cronExecution: 'not invoked',
    rollback: 'not invoked',
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.platform !== 'linux' || process.argv.length !== 4) throw Error('Run on Ubuntu: node deploy/vps/inspect-host.mjs DOMAIN EXPECTED_FULL_SHA');
    console.log(JSON.stringify(await inspectHost({ domain: process.argv[2], commit: process.argv[3] }), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
