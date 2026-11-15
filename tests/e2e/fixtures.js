import { test as base, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { isolatedApiEnvironment } from './environment.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const port = Number(process.env.E2E_API_PORT || 3198);

// One worker per isolated preview/API port. A fresh process and data directory
// for every test (including retries) prevent preference/fixture leakage and
// exercise the same production routes without adding a reset API to the app.
export const test = base.extend({
  _isolatedApi: [
    async ({ browserName }, use, testInfo) => {
      const directory = path.join(root, '.data/e2e', `${browserName}-${randomUUID()}`);
      const child = spawn(process.execPath, [path.join(root, 'src/server/index.js')], {
        cwd: root,
        env: {
          ...process.env,
          ...isolatedApiEnvironment,
          PORT: String(port),
          DATABASE_PATH: path.join(directory, 'workspace.json'),
          UPLOADS_PATH: path.join(directory, 'uploads'),
          BACKUPS_PATH: path.join(directory, 'backups'),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
      let log = '';
      let spawnError;
      const collect = chunk => {
        log = (log + chunk.toString()).slice(-16000);
      };
      child.stdout.on('data', collect);
      child.stderr.on('data', collect);
      child.on('error', error => {
        spawnError = error;
      });
      try {
        const deadline = Date.now() + 25000;
        for (;;) {
          if (spawnError || child.exitCode !== null) throw new Error(`Isolated API startup failed: ${spawnError?.message || log}`);
          const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1000) }).catch(() => null);
          if (response?.ok) break;
          if (Date.now() > deadline) throw new Error(`Isolated API did not become ready: ${log}`);
          await delay(150);
        }
        await use();
      } finally {
        if (testInfo.status !== testInfo.expectedStatus) await testInfo.attach('isolated-api.log', { body: log, contentType: 'text/plain' });
        if (child.pid && child.exitCode === null && child.signalCode === null) {
          const exited = once(child, 'exit');
          child.kill('SIGTERM');
          if (!(await Promise.race([exited.then(() => true), delay(5000, false)]))) {
            child.kill('SIGKILL');
            await exited;
          }
        }
      }
    },
    { auto: true, timeout: 35000 },
  ],
});
export { expect };
