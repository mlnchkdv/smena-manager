import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { createHash, randomUUID } from 'node:crypto';
import { BACKUP_OBJECT_MAX_BYTES, restorePreparedBackup } from '../prepared-workspace-backup.js';

const digest = text => createHash('sha256').update(text).digest('hex');
const valid = hash => {
  if (!/^[a-f0-9]{64}$/.test(hash || '')) throw new Error('Invalid backup object.');
  return hash;
};
const verify = (text, hash) => {
  valid(hash);
  if (typeof text !== 'string' || Buffer.byteLength(text) > BACKUP_OBJECT_MAX_BYTES || digest(text) !== hash)
    throw Object.assign(new Error('Backup object integrity check failed.'), { code: 'BACKUP_PREPARATION_INTEGRITY', statusCode: 503 });
  return text;
};
async function exclusive(target, text) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  try {
    if ((await fs.stat(target)).size > BACKUP_OBJECT_MAX_BYTES || (await fs.readFile(target, 'utf8')) !== text)
      throw Object.assign(new Error('Backup object integrity check failed.'), { code: 'BACKUP_PREPARATION_INTEGRITY', statusCode: 503 });
    return;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const temporary = target + '.' + randomUUID() + '.tmp';
  try {
    await fs.writeFile(temporary, text, { encoding: 'utf8', flag: 'wx' });
    try {
      await fs.link(temporary, target);
    } catch (error) {
      if (error.code !== 'EEXIST' || (await fs.readFile(target, 'utf8')) !== text) throw error;
    }
  } finally {
    await fs.unlink(temporary).catch(() => undefined);
  }
}
export function localPreparedBackups(storage) {
  const objectPath = hash => path.join(storage.backupsPath, 'objects', valid(hash) + '.json');
  return {
    async readWorkspaceBackupObject(hash) {
      const target = objectPath(hash);
      if ((await fs.stat(target)).size > BACKUP_OBJECT_MAX_BYTES) throw new Error('Backup object exceeds its limit.');
      return verify(await fs.readFile(target, 'utf8'), hash);
    },
    async writeWorkspaceBackupObject(text, hash) {
      await exclusive(objectPath(hash), verify(text, hash));
    },
    async publishWorkspaceBackup(manifest) {
      const text = JSON.stringify(manifest),
        id = 'prepared-' + digest(text) + '.json';
      await exclusive(storage.backupPath(id), text);
      return { id, createdAt: manifest.createdAt, label: manifest.label, size: manifest.bytes };
    },
  };
}

const escapeQuery = value => String(value).replaceAll('\\', '\\\\').replaceAll("'", "\\'");
export function drivePreparedBackups(storage) {
  const list = async (name, key, value) => {
    const parent = await storage.ensureBackupsFolder();
    const result = await storage.client.files.list(
      {
        q: `'${escapeQuery(parent)}' in parents and trashed = false and name = '${escapeQuery(name)}' and appProperties has { key='${key}' and value='${value}' }${key === 'smenaPreparedKey' ? " and appProperties has { key='smenaBackup' and value='true' }" : ''}`,
        fields: 'nextPageToken,files(id,size,createdTime,appProperties)',
        pageSize: 100,
        spaces: 'drive',
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
      },
      { signal: AbortSignal.timeout(15000) },
    );
    if (result.data.nextPageToken) throw new Error('Too many duplicate backup objects; operator review is required.');
    return result.data.files || [];
  };
  const read = async file => {
    if (Number(file.size) > BACKUP_OBJECT_MAX_BYTES) throw new Error('Backup object exceeds its limit.');
    return (
      await storage.client.files.get({ fileId: file.id, alt: 'media', supportsAllDrives: true }, { responseType: 'text', signal: AbortSignal.timeout(15000) })
    ).data;
  };
  const put = async (text, name, properties) =>
    (
      await storage.client.files.create(
        {
          requestBody: { name, parents: [await storage.ensureBackupsFolder()], mimeType: 'application/json', appProperties: properties },
          media: { mimeType: 'application/json', body: Readable.from([text]) },
          fields: 'id,size,createdTime',
          supportsAllDrives: true,
        },
        { signal: AbortSignal.timeout(15000) },
      )
    ).data;
  return {
    async deletePreparedBackupCopies(key) {
      valid(key);
      const files = await list('smena-backup-prepared-' + key + '.json', 'smenaPreparedKey', key);
      if (!files.length) throw new Error('Backup unavailable.');
      // Validate every duplicate before deleting any. Concurrent identical
      // publications are one logical backup, not resurrecting copies.
      for (const file of files) if (digest(await read(file)) !== key) throw new Error('Backup manifest integrity check failed.');
      for (const file of files) await storage.client.files.delete({ fileId: file.id, supportsAllDrives: true });
    },
    async readWorkspaceBackupObject(hash) {
      const files = await list('smena-backup-object-' + valid(hash) + '.json', 'smenaBackupObject', '1');
      if (!files.length) throw Object.assign(new Error('Backup object unavailable.'), { code: 'ENOENT' });
      return verify(await read(files[0]), hash);
    },
    async writeWorkspaceBackupObject(text, hash) {
      verify(text, hash);
      const name = 'smena-backup-object-' + hash + '.json',
        files = await list(name, 'smenaBackupObject', '1');
      if (files.length) {
        verify(await read(files[0]), hash);
        return;
      }
      await put(text, name, { smenaBackupObject: '1' });
    },
    async publishWorkspaceBackup(manifest) {
      const text = JSON.stringify(manifest),
        key = digest(text),
        name = 'smena-backup-prepared-' + key + '.json';
      const found = await list(name, 'smenaPreparedKey', key);
      if (found.length && (await read(found[0])) !== text) throw new Error('Backup manifest integrity check failed.');
      const file =
        found[0] || (await put(text, name, { smenaBackup: 'true', smenaPreparedKey: key, label: manifest.label, snapshotBytes: String(manifest.bytes) }));
      return { id: file.id, createdAt: manifest.createdAt, label: manifest.label, size: manifest.bytes };
    },
  };
}

export { restorePreparedBackup };
