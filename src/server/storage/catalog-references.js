import { physicalFileKey } from '../file-registry.js';
import { readCatalogAccounting } from '../file-catalog-accounting.js';

const corrupt = () => Object.assign(new Error('The file reference index is incomplete or corrupt.'), { code: 'FILE_CATALOG_CORRUPT', statusCode: 503 });

export function catalogReferences(files) {
  const refs = new Map();
  for (const file of files) {
    const key = physicalFileKey(file);
    if (key) refs.set(key, (refs.get(key) || 0) + 1);
  }
  return { version: 1, entries: [...refs] };
}

export function validateCatalogReferences(value) {
  if (value === undefined) return null;
  if (value?.version !== 1 || !Array.isArray(value.entries) || value.entries.length > 100000) throw corrupt();
  const refs = new Map();
  let total = 0;
  for (const entry of value.entries) {
    if (
      !Array.isArray(entry) ||
      entry.length !== 2 ||
      typeof entry[0] !== 'string' ||
      !/^(id|name):.+$/u.test(entry[0]) ||
      entry[0].length > 1024 ||
      refs.has(entry[0]) ||
      !Number.isSafeInteger(entry[1]) ||
      entry[1] < 1 ||
      (total += entry[1]) > 100000
    )
      throw corrupt();
    refs.set(entry[0], entry[1]);
  }
  return refs;
}

export function readCatalogReferences(root) {
  const refs = validateCatalogReferences(root._fileCatalog?.physicalReferences);
  if (!refs) return null;
  const accounting = readCatalogAccounting(root);
  if (!accounting) return null;
  const total = [...refs.values()].reduce((sum, count) => sum + count, 0);
  const { activePhysical, aliases } = accounting.fileStorage;
  if (refs.size !== activePhysical.files || total - refs.size !== aliases) throw corrupt();
  let known = 0,
    unknown = 0;
  for (const key of refs.keys()) {
    const bytes = root._fileRegistry?.[key]?.bytes;
    if (Number.isFinite(bytes) && bytes >= 0) known += bytes;
    else unknown++;
  }
  if (known !== activePhysical.knownBytes || unknown !== activePhysical.unknownFiles) throw corrupt();
  return refs;
}
