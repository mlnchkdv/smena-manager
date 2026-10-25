import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isDeepStrictEqual as same } from 'node:util';
import { catalogRecords, catalogCore } from './file-catalog-shards.js';
import { readCatalogAccounting } from '../file-catalog-accounting.js';
import { readCatalogReferences, referenceAccounting } from './catalog-references.js';
import { indexStoredFiles, physicalFileKey } from '../file-registry.js';
import { workspaceTransportBytes } from '../../shared/workspace-size.js';
import { FILE_CATALOG_MAX_BYTES } from '../../shared/file-catalog.js';

const corrupt = () => Object.assign(new Error('The backup catalog is incomplete or corrupt.'), { code: 'FILE_CATALOG_CORRUPT', statusCode: 503 });

// Verify every immutable part before creating a Drive backup. Keep record bytes
// in a private, bounded temporary spool, not a full JS catalog and its clones.
// Global order is restored from manifest ordinals, independently of part order.
export async function withCatalogBackupSpool(root, read, consume) {
  const core = catalogCore(root, { identities: false });
  const accounting = readCatalogAccounting(root);
  if (!accounting) throw corrupt();
  const total = root._fileCatalog.total;
  const offsets = new Uint32Array(total),
    lengths = new Uint32Array(total);
  const registry = { files: [], _fileRegistry: structuredClone(core._fileRegistry) };
  const refs = new Map(),
    logical = { files: total, knownBytes: 0, unknownFiles: 0 };
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'smena-backup-'));
  const filename = path.join(directory, 'catalog.jsonl');
  let handle,
    offset = 0,
    count = 0;
  try {
    handle = await fs.promises.open(filename, 'wx+', 0o600);
    for await (const { index, file } of catalogRecords(root, read)) {
      const text = Buffer.from(JSON.stringify(file));
      if (offset + text.length > FILE_CATALOG_MAX_BYTES) throw corrupt();
      offsets[index] = offset;
      lengths[index] = text.length;
      for (let written = 0; written < text.length;) {
        const result = await handle.write(text, written, text.length - written, offset + written);
        if (!result.bytesWritten) throw new Error('Backup spool write failed.');
        written += result.bytesWritten;
      }
      offset += text.length;
      count++;
      if (Number.isFinite(file.bytes) && file.bytes >= 0) logical.knownBytes += file.bytes;
      else logical.unknownFiles++;
      const key = physicalFileKey(file);
      if (key) refs.set(key, (refs.get(key) || 0) + 1);
      registry.files = [file];
      indexStoredFiles(registry);
    }
    const bytes = workspaceTransportBytes({ files: [] }, root.revision) + offset + Math.max(0, count - 1);
    if (count !== total || bytes !== accounting.catalogBytes || !same(referenceAccounting(core, refs, logical), accounting.fileStorage)) throw corrupt();
    const storedRefs = readCatalogReferences(root);
    if (storedRefs && !same(storedRefs, refs)) throw corrupt();
    if (!same(registry._fileRegistry, core._fileRegistry))
      throw Object.assign(new Error('Canonical file registry normalization is required.'), { code: 'BACKUP_CANONICAL_REQUIRED' });
    function* records() {
      for (let index = 0; index < total; index++) {
        const buffer = Buffer.allocUnsafe(lengths[index]);
        for (let done = 0; done < buffer.length;) {
          const size = fs.readSync(handle.fd, buffer, done, buffer.length - done, offsets[index] + done);
          if (!size) throw new Error('Backup spool is incomplete.');
          done += size;
        }
        yield buffer.toString('utf8');
      }
    }
    return await consume(core, records());
  } finally {
    await handle?.close();
    await fs.promises.unlink(filename).catch(error => {
      if (error.code !== 'ENOENT') throw error;
    });
    await fs.promises.rmdir(directory);
  }
}
