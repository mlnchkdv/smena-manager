import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { cronResult } from './lib.mjs';

export async function invokeCron({ secret, fetcher = fetch, timeout = 840000 } = {}) {
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('Cron configuration is missing.');
  const response = await fetcher('http://127.0.0.1:3001/api/cron/reminders', {
    headers: { Authorization: `Bearer ${secret}` },
    redirect: 'error',
    signal: AbortSignal.timeout(timeout),
  });
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new Error(`Cron transport failed: HTTP ${response.status}.`);
  }
  let text = '',
    bytes = 0;
  const reader = response.body.getReader();
  try {
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        text += decoder.decode();
        break;
      }
      bytes += value.byteLength;
      if (bytes > 1024 * 1024) throw new Error('Cron response exceeds the monitoring limit.');
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  let result;
  try {
    result = JSON.parse(text);
  } catch {
    throw new Error('Cron returned invalid JSON.');
  }
  return {
    at: new Date().toISOString(),
    ok: cronResult(result),
    status: ['ok', 'degraded', 'failed'].includes(result.status) ? result.status : 'invalid',
    workspaces: Array.isArray(result.workspaces) ? result.workspaces.length : 0,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const summary = await invokeCron({ secret: process.env.CRON_SECRET });
    const file = '/var/lib/smena-manager/cron-last-run.json';
    await fs.writeFile(file + '.tmp', JSON.stringify(summary) + '\n', { mode: 0o600 });
    await fs.rename(file + '.tmp', file);
    console.log(`Daily automation: ${summary.status}; workspaces=${summary.workspaces}.`);
    if (!summary.ok) process.exitCode = 1;
  } catch {
    console.error('Daily automation failed or timed out. Inspect application diagnostics before any manual retry.');
    process.exitCode = 1;
  }
}
