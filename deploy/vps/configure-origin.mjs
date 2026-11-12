import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { domainName, parseVpsEnv, ENV_FILE } from './lib.mjs';

export function originConfiguration(text, domain) {
  const origin = `https://${domainName(domain)}`;
  const env = parseVpsEnv(text);
  const lines = text.replaceAll('\r\n', '\n').split('\n');
  const index = lines.findIndex(line => /^APP_ORIGIN=/.test(line.trim()));
  if (index < 0) lines.push(`APP_ORIGIN=${origin}`);
  else lines[index] = `APP_ORIGIN=${origin}`;
  return { origin, changed: env.APP_ORIGIN !== origin, text: lines.join('\n').replace(/\n*$/, '\n') };
}

export async function configureOrigin(file, domain, { write = false } = {}) {
  file = path.resolve(file);
  const info = await fs.lstat(file);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('Environment must be a regular file, not a symlink.');
  const original = await fs.readFile(file, 'utf8');
  const result = originConfiguration(original, domain);
  if (write && result.changed) {
    const temporary = path.join(path.dirname(file), `.smena-origin-${randomUUID()}.tmp`);
    try {
      const handle = await fs.open(temporary, 'wx', info.mode & 0o777);
      try {
        await handle.writeFile(result.text, 'utf8');
        if (process.platform !== 'win32') {
          await handle.chmod(info.mode & 0o777);
          await handle.chown(info.uid, info.gid);
        }
        await handle.sync();
      } finally {
        await handle.close();
      }
      if ((await fs.readFile(file, 'utf8')) !== original || (await fs.lstat(file)).isSymbolicLink())
        throw new Error('Environment changed while preparing origin. Retry against the current file.');
      await fs.rename(temporary, file);
    } finally {
      await fs.unlink(temporary).catch(() => {});
    }
  }
  return { origin: result.origin, changed: result.changed, written: write && result.changed, googleJavaScriptOrigins: [result.origin] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2),
      values = {};
    for (let i = 0; i < args.length; i++) {
      const key = args[i];
      if (key === '--write') values.write = true;
      else if (['--domain', '--env-file'].includes(key) && args[i + 1] && !args[i + 1].startsWith('--')) values[key] = args[++i];
      else throw new Error('Usage: configure-origin.mjs --domain tasks.example.com [--env-file path] [--write]. Default: read-only.');
    }
    const result = await configureOrigin(values['--env-file'] || ENV_FILE, values['--domain'], { write: values.write === true });
    console.log(JSON.stringify(result));
    console.log('Add this HTTPS origin to the existing Google Web client. Popup sign-in needs no new redirect callback.');
  } catch (error) {
    console.error(['ENOENT', 'EACCES', 'EPERM'].includes(error.code) ? 'Cannot read or update the protected environment file.' : error.message);
    process.exitCode = 1;
  }
}
