import { fileStorageAccounting } from './file-capacity.js';
import { workspaceTransportBytes } from '../shared/workspace-size.js';

const corrupt = () => Object.assign(new Error('The stored catalog accounting is incomplete or corrupt.'), { code: 'FILE_CATALOG_CORRUPT', statusCode: 503 });
const count = value => Number.isSafeInteger(value) && value >= 0;
const bytes = value => Number.isFinite(value) && value >= 0;

// Derived from the canonical write, never from catalogCore's identity stubs.
// Trash/registry changes require a fresh summary even if all parts are reused.
export function createCatalogAccounting(data) {
  return {
    version: 1,
    revision: Number(data.revision || 0),
    catalogBytes: workspaceTransportBytes({ files: data.files }, data.revision),
    fileStorage: fileStorageAccounting(data),
  };
}

export function readCatalogAccounting(root) {
  const value = root._fileCatalog?.accounting;
  if (value === undefined) return null; // Legacy roots retain exact canonical fallback.
  const storage = value?.fileStorage;
  if (
    root._fileCatalog.version !== 3 ||
    value?.version !== 1 ||
    !count(value.revision) ||
    value.revision !== Number(root.revision || 0) ||
    !count(value.catalogBytes) ||
    value.catalogBytes < workspaceTransportBytes({ files: [] }, root.revision) ||
    !storage ||
    !count(storage.aliases) ||
    storage.backupPhysicalBytes !== null
  )
    throw corrupt();
  for (const key of ['logical', 'activePhysical', 'retainedPhysical']) {
    const item = storage[key];
    if (!item || !count(item.files) || !count(item.unknownFiles) || item.unknownFiles > item.files || !bytes(item.knownBytes)) throw corrupt();
  }
  if (storage.logical.files !== root._fileCatalog.total || storage.aliases + storage.activePhysical.files > storage.logical.files) throw corrupt();
  // Return only the known shape, not arbitrary persisted diagnostics/text.
  return {
    catalogBytes: value.catalogBytes,
    fileStorage: {
      ...Object.fromEntries(
        ['logical', 'activePhysical', 'retainedPhysical'].map(key => [
          key,
          {
            knownBytes: storage[key].knownBytes,
            unknownFiles: storage[key].unknownFiles,
            files: storage[key].files,
          },
        ]),
      ),
      aliases: storage.aliases,
      backupPhysicalBytes: null,
      note: 'Known metadata only; backup-only objects and other Drive content are not included.',
    },
  };
}
