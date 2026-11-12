import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function probeMonitor({
  secret,
  fetcher = fetch,
  disk = () => fs.statfs('/srv/smena-manager'),
  memory = () => ({ available: os.freemem(), total: os.totalmem() }),
}) {
  if (!secret || secret.length < 32) throw Error('Configure a dedicated MONITOR_SECRET.');
  const issues = [];
  for (const route of ['health', 'monitor/readiness']) {
    try {
      const response = await fetcher('http://127.0.0.1:3001/api/' + route, {
        redirect: 'error',
        signal: AbortSignal.timeout(90000),
        headers: route === 'health' ? {} : { Authorization: 'Bearer ' + secret },
      });
      const text = await response.text();
      if (text.length > 65536) throw Error('Invalid monitor response.');
      const body = JSON.parse(text);
      if (!response.ok || body.status !== (route === 'health' ? 'ok' : 'ready')) issues.push(route === 'health' ? 'process_unavailable' : 'readiness_degraded');
      for (const code of body.issues || []) if (typeof code === 'string' && /^[a-z_]{1,40}$/.test(code)) issues.push(code);
    } catch {
      issues.push(route === 'health' ? 'process_unavailable' : 'readiness_unavailable');
    }
  }
  const space = await disk(),
    available = Number(space.bavail) * Number(space.bsize);
  if (!Number.isFinite(available) || available < 4 * 1024 ** 3) issues.push('disk_low');
  const ram = memory();
  if (ram.available < 256 * 1024 ** 2 || ram.available / ram.total < 0.03) issues.push('memory_low');
  return { at: new Date().toISOString(), ok: !issues.length, issues: [...new Set(issues)], diskAvailableBytes: available };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = await probeMonitor({ secret: process.env.MONITOR_SECRET });
    const file = '/var/lib/smena-manager/monitor-last-run.json';
    await fs.writeFile(file + '.tmp', JSON.stringify(result) + '\n', { mode: 0o600 });
    await fs.rename(file + '.tmp', file);
    console.log(JSON.stringify(result));
    if (!result.ok) process.exitCode = 1;
  } catch {
    console.error('Independent monitor failed. Inspect configuration and local service journals.');
    process.exitCode = 1;
  }
}
