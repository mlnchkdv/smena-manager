import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { createHash, randomUUID } from 'node:crypto';
import { storageVersion, rememberStorageVersion } from './version-token.js';
import { renameWithRetry } from './windows-file-retry.js';

const NAME = 'smena-manager-public-links.json';
const empty = () => ({ schemaVersion: 1, records: [] });
const etag = response => response.headers?.get?.('etag') || response.headers?.etag;
const digest = text => createHash('sha256').update(text).digest('hex');
function parse(text) {
  if (Buffer.byteLength(text) > 2 * 1024 * 1024) throw new Error('Public link registry limit exceeded.');
  const data = JSON.parse(text);
  if (data?.schemaVersion !== 1 || !Array.isArray(data.records)) throw new Error('Public link registry is invalid.');
  return data;
}
async function driveId(provider) {
  await provider.init();
  if (provider.publicLinkRegistryId) return provider.publicLinkRegistryId;
  const root = provider.rootFolderId.replace(/'/g, "\\'");
  const { data } = await provider.client.files.list({
    q: `name = '${NAME}' and '${root}' in parents and trashed = false`,
    fields: 'files(id)',
    pageSize: 2,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  if (data.files?.length > 1) throw new Error('Multiple public link registries exist.');
  return (provider.publicLinkRegistryId = data.files?.[0]?.id || null);
}
export async function readPublicLinkRegistry(provider) {
  if (provider.name === 'google-drive') {
    const id = await driveId(provider);
    if (!id) return empty();
    const response = await provider.readVersionedJson(id);
    const text = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
    return rememberStorageVersion(parse(text), etag(response));
  }
  const filename = path.join(path.dirname(provider.databasePath), NAME);
  try {
    const text = await fs.readFile(filename, 'utf8');
    return rememberStorageVersion(parse(text), digest(text));
  } catch (error) {
    if (error.code === 'ENOENT') return empty();
    throw error;
  }
}
export async function savePublicLinkRegistry(provider, value, baseline) {
  const text = JSON.stringify(value);
  parse(text);
  if (provider.name === 'google-drive') {
    const id = await driveId(provider);
    const media = { mimeType: 'application/json', body: Readable.from([text]) };
    if (id) {
      const version = storageVersion(baseline);
      if (!version) throw Object.assign(new Error('Registry changed.'), { statusCode: 409 });
      await provider.updateVersionedJson({ fileId: id, media, supportsAllDrives: true }, { headers: { 'If-Match': version } });
    } else {
      provider.assertBootstrapAllowed();
      const result = await provider.client.files.create({
        requestBody: { name: NAME, parents: [provider.rootFolderId], mimeType: 'application/json', appProperties: { smenaPrivate: 'public-links' } },
        media,
        fields: 'id',
        supportsAllDrives: true,
      });
      provider.publicLinkRegistryId = result.data.id;
    }
    return;
  }
  await provider.init();
  const filename = path.join(path.dirname(provider.databasePath), NAME);
  const latest = await readPublicLinkRegistry(provider);
  if (storageVersion(latest) !== storageVersion(baseline)) throw Object.assign(new Error('Registry changed.'), { statusCode: 409 });
  const temporary = filename + '.' + randomUUID() + '.tmp';
  try {
    await fs.writeFile(temporary, text, { mode: 0o600 });
    await renameWithRetry(temporary, filename);
  } finally {
    await fs.unlink(temporary).catch(() => {});
  }
}
