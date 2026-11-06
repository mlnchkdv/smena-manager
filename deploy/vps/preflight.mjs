import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { domainName, loadProtectedEnvironment } from './lib.mjs';

export async function preflight() {
  if (process.platform !== 'linux' || process.versions.node.split('.')[0] !== '22') throw new Error('VPS runtime requires Linux and Node.js 22.');
  if (Object.hasOwn(process.env, 'VERCEL')) throw new Error('Remove VERCEL from the VPS runtime environment.');
  let config;
  try {
    config = JSON.parse(await fs.readFile('/etc/smena-manager/deploy.json', 'utf8'));
  } catch {
    throw new Error('VPS deployment configuration is missing or invalid.');
  }
  const configured = await loadProtectedEnvironment(domainName(config.domain));
  // systemd must load the same protected file; a missing EnvironmentFile must
  // never quietly create a different local workspace or ephemeral session key.
  for (const [key, value] of Object.entries(configured.env))
    if ((process.env[key] || '') !== value) throw new Error(`Runtime environment differs from the protected configuration: ${key}.`);
  return configured.features;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const features = await preflight();
    console.log(`VPS configuration OK: Drive + Google; Gmail=${features.gmail}; Push=${features.push}.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
