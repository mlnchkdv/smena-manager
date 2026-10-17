import fs from 'node:fs/promises';
import path from 'node:path';
import { LocalStorageProvider } from '../src/server/storage/local-storage.js';
import { restoreRecoveryBundle, validateRecoveryBundle } from '../src/server/recovery-bundle.js';

const [source, destination] = process.argv.slice(2);
if (!source || !destination) {
  console.error('Usage: node scripts/restore-recovery.js <bundle.json> <new-empty-directory>');
  process.exitCode = 1;
} else {
  const target = path.resolve(destination);
  try {
    const entries = await fs.readdir(target).catch(error => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    if (entries.length) throw new Error('Destination directory is not empty. Nothing was changed.');
    const metadata = await fs.stat(source);
    if (metadata.size > 160 * 1024 * 1024) throw new Error('Recovery bundle is too large.');
    const bundle = JSON.parse(await fs.readFile(source, 'utf8'));
    validateRecoveryBundle(bundle);
    const storage = new LocalStorageProvider(path.join(target, 'workspace.json'));
    storage.uploadsPath = path.join(target, 'uploads');
    storage.backupsPath = path.join(target, 'backups');
    console.log(JSON.stringify(await restoreRecoveryBundle(bundle, storage)));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
