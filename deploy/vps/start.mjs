import fs from 'node:fs/promises';
import { preflight } from './preflight.mjs';

try {
  await preflight();
  const release = JSON.parse(await fs.readFile(new URL('../../.smena-release.json', import.meta.url), 'utf8'));
  if (!/^[a-f0-9]{40}$/.test(release.commit || '')) throw new Error('Release manifest is invalid.');
  process.env.SMENA_RELEASE = release.commit;
  await import('../../src/server/index.js');
} catch {
  // Provider/configuration errors must not leak credentials into journald.
  console.error('Smena VPS startup failed. Check preflight and authorized Drive access; no local fallback was enabled.');
  process.exitCode = 1;
}
