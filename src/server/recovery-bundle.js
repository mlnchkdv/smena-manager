import crypto from 'node:crypto';
import { once } from 'node:events';
import { validateWorkspaceData } from '../shared/workspace-schema.js';

const MAX_ASSET_BYTES = 100 * 1024 * 1024;
const storageKey = file => (file.storageFileId ? `id:${file.storageFileId}` : `name:${file.storageName}`);

function collectAssets(value, found = new Map()) {
  if (!value || typeof value !== 'object') return found;
  if (typeof value.storageName === 'string' && value.storageName) found.set(storageKey(value), value);
  for (const [key, child] of Object.entries(value)) if (!key.startsWith('_') && child && typeof child === 'object') collectAssets(child, found);
  return found;
}

export async function writeRecoveryBundle(database, storage, output, options = {}) {
  const data = structuredClone(database);
  delete data._notificationOutbox;
  delete data._fileGc;
  delete data._importHistory;
  const assets = collectAssets(data);
  const estimated = [...assets.values()].reduce((total, file) => total + Number(file.bytes || 0), 0);
  if (estimated > (options.maxAssetBytes || MAX_ASSET_BYTES))
    throw Object.assign(new Error('Recovery export exceeds the 100 MB attachment limit. Export large files separately.'), {
      statusCode: 413,
      code: 'RECOVERY_TOO_LARGE',
    });
  const write = async chunk => {
    if (!output.write(chunk)) await once(output, 'drain', { signal: AbortSignal.timeout(30000) });
  };
  const json = JSON.stringify(data);
  await write(
    `{"format":"smena-recovery","version":1,"exportedAt":${JSON.stringify(new Date().toISOString())},"data":${json},"dataSha256":${JSON.stringify(crypto.createHash('sha256').update(json).digest('hex'))},"assets":[`,
  );
  let total = 0;
  let index = 0;
  for (const [key, file] of assets) {
    if (index++) await write(',');
    const opened = await storage.openDownloadStream(file.storageName, file.storageFileId);
    if (!opened?.stream) throw new Error('A referenced attachment is missing. A complete recovery bundle could not be exported.');
    const hash = crypto.createHash('sha256');
    let carry = Buffer.alloc(0);
    let bytes = 0;
    await write(`{"key":${JSON.stringify(key)},"mimeType":${JSON.stringify(file.mimeType || 'application/octet-stream')},"base64":"`);
    try {
      for await (const part of opened.stream) {
        const chunk = Buffer.isBuffer(part) ? part : Buffer.from(part);
        bytes += chunk.length;
        total += chunk.length;
        if (total > (options.maxAssetBytes || MAX_ASSET_BYTES))
          throw new Error('Recovery export exceeds the 100 MB attachment limit. Export large files separately.');
        hash.update(chunk);
        const pending = Buffer.concat([carry, chunk]);
        const complete = pending.length - (pending.length % 3);
        if (complete) await write(pending.subarray(0, complete).toString('base64'));
        carry = pending.subarray(complete);
      }
      if (carry.length) await write(carry.toString('base64'));
    } finally {
      opened.stream.destroy?.();
    }
    await write(`","bytes":${bytes},"sha256":${JSON.stringify(hash.digest('hex'))}}`);
  }
  await write(']}');
  output.end();
  return { assets: assets.size, bytes: total };
}

export function validateRecoveryBundle(bundle) {
  if (bundle?.format !== 'smena-recovery' || bundle.version !== 1 || !Array.isArray(bundle.assets)) throw new TypeError('Unsupported recovery bundle.');
  validateWorkspaceData(bundle.data);
  if (crypto.createHash('sha256').update(JSON.stringify(bundle.data)).digest('hex') !== bundle.dataSha256)
    throw new TypeError('Recovery workspace integrity check failed.');
  const assets = new Map();
  let total = 0;
  for (const asset of bundle.assets) {
    if (
      !asset ||
      typeof asset.key !== 'string' ||
      assets.has(asset.key) ||
      typeof asset.base64 !== 'string' ||
      asset.base64.length > (MAX_ASSET_BYTES * 4) / 3 + 4 ||
      /[^A-Za-z0-9+/=]/u.test(asset.base64)
    )
      throw new TypeError('Invalid recovery asset.');
    const bytes = Buffer.from(asset.base64, 'base64');
    total += bytes.length;
    if (
      total > MAX_ASSET_BYTES ||
      bytes.toString('base64') !== asset.base64 ||
      bytes.length !== asset.bytes ||
      crypto.createHash('sha256').update(bytes).digest('hex') !== asset.sha256
    )
      throw new TypeError('Recovery asset integrity check failed.');
    assets.set(asset.key, { ...asset, bytes });
  }
  for (const key of collectAssets(bundle.data).keys()) if (!assets.has(key)) throw new TypeError('Recovery bundle is missing a referenced asset.');
  return assets;
}

export async function restoreRecoveryBundle(bundle, storage) {
  const assets = validateRecoveryBundle(bundle);
  await storage.init();
  if (await storage.loadDatabase()) throw new Error('Recovery destination must be empty. Existing data was not overwritten.');
  const mappings = new Map();
  for (const [key, asset] of assets) {
    const filename = `recovered-${crypto.randomUUID()}.bin`;
    mappings.set(key, await storage.uploadFile(filename, asset.bytes, asset.mimeType));
  }
  const data = structuredClone(bundle.data);
  function remap(value) {
    if (!value || typeof value !== 'object') return;
    if (value.storageName) {
      const uploaded = mappings.get(storageKey(value));
      if (!uploaded) throw new TypeError('Recovery asset mapping is missing.');
      value.storageName = uploaded.filename;
      value.storageFileId = uploaded.fileId;
    }
    for (const [key, child] of Object.entries(value)) if (!key.startsWith('_') && child && typeof child === 'object') remap(child);
  }
  remap(data);
  data._notificationOutbox = [];
  data._fileGc = [];
  await storage.saveDatabase(data);
  return { files: assets.size, tasks: data.tasks.length, projects: data.projects.length };
}
