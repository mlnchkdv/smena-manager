import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

// Offline exports only. Never contacts Google or runs a restore. Symlinks are refused.
export async function backupInventory(directory) {
  const root = path.resolve(directory);
  if ((await fs.lstat(root)).isSymbolicLink() || (await fs.realpath(root)) !== root) throw Error('Use a real export directory.');
  const files = [];
  async function walk(current) {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (!target.startsWith(root + path.sep) || entry.isSymbolicLink()) throw Error('Unsafe export entry.');
      if (entry.isDirectory()) await walk(target);
      else if (entry.isFile()) {
        const before = await fs.stat(target),
          hash = createHash('sha256');
        let bytes = 0;
        for await (const chunk of createReadStream(target)) {
          hash.update(chunk);
          bytes += chunk.length;
        }
        const after = await fs.stat(target);
        if (bytes !== before.size || before.mtimeMs !== after.mtimeMs || before.ino !== after.ino) throw Error('Export changed during inventory.');
        files.push({ path: path.relative(root, target).split(path.sep).join('/'), bytes, sha256: hash.digest('hex') });
        if (files.length > 100000) throw Error('Export inventory limit exceeded. Split the export.');
      } else throw Error('Unsupported export entry.');
    }
  }
  await walk(root);
  if (!files.length) throw Error('Export is empty.');
  return { version: 1, files: files.sort((a, b) => a.path.localeCompare(b.path, 'en')) };
}
export async function verifyBackupInventory(directory, manifest) {
  if (manifest?.version !== 1 || !Array.isArray(manifest.files) || manifest.files.length > 100000) throw Error('Invalid inventory.');
  const actual = await backupInventory(directory);
  if (JSON.stringify(actual) !== JSON.stringify({ version: 1, files: manifest.files }))
    throw Error('Export integrity mismatch: missing, added or changed objects.');
  return { verified: true, files: actual.files.length, bytes: actual.files.reduce((sum, file) => sum + file.bytes, 0) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const [action, directory, manifest, extra] = process.argv.slice(2);
    if (!['create', 'verify'].includes(action) || !directory || !manifest || extra)
      throw Error('Usage: backup-inventory.mjs create|verify EXPORT_DIRECTORY MANIFEST_OUTSIDE_DIRECTORY');
    const root = path.resolve(directory),
      target = path.resolve(manifest);
    if (target === root || target.startsWith(root + path.sep)) throw Error('Keep the manifest outside the export directory.');
    if (action === 'create') {
      const inventory = await backupInventory(root);
      await fs.writeFile(target, JSON.stringify(inventory, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
      console.log(JSON.stringify({ created: true, files: inventory.files.length }));
    } else {
      if ((await fs.stat(target)).size > 32 * 1024 * 1024) throw Error('Inventory exceeds its limit.');
      console.log(JSON.stringify(await verifyBackupInventory(root, JSON.parse(await fs.readFile(target, 'utf8')))));
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
