// File metadata travels separately from the core snapshot. A complete catalog
// is still hydrated before editing: a partial page must never imply deletion.
export const FILE_CATALOG_PAGE_SIZE = 100;
export const FILE_CATALOG_MAX_BYTES = 32 * 1024 * 1024;

export function fileCatalogPage(data, { revision, offset = 0, project = 'all', token, expectedToken } = {}) {
  if (!Number.isSafeInteger(revision) || revision < 0 || (token ? token !== expectedToken : revision !== data.revision))
    throw Object.assign(new Error('The workspace changed after it was loaded. Refresh and retry.'), {
      statusCode: 409,
      code: 'REVISION_CONFLICT',
      currentRevision: data.revision,
    });
  if (!Number.isSafeInteger(offset) || offset < 0 || typeof project !== 'string') throw new TypeError('Invalid file catalog page.');
  const files = (data.files || []).filter(file => project === 'all' || file.project === project);
  const page = [];
  let bytes = 0;
  for (const file of files.slice(offset, offset + FILE_CATALOG_PAGE_SIZE)) {
    const size = new TextEncoder().encode(JSON.stringify(file)).byteLength;
    if (size > 2 * 1024 * 1024) throw Object.assign(new Error('File metadata exceeds the catalog page limit.'), { statusCode: 413 });
    if (bytes + size > 2 * 1024 * 1024) break;
    bytes += size;
    page.push(file);
  }
  return {
    revision,
    files: page,
    total: files.length,
    nextOffset: offset + page.length < files.length ? offset + page.length : null,
  };
}

export function fileCatalogChanges(before, after) {
  const original = new Map(before.map(file => [file.id, file]));
  const remaining = new Set(after.map(file => file.id));
  return {
    upsert: after.filter(file => JSON.stringify(file) !== JSON.stringify(original.get(file.id))),
    remove: before.filter(file => !remaining.has(file.id)).map(file => file.id),
  };
}

export function applyFileCatalogChanges(files, changes) {
  if (!changes || !Array.isArray(changes.upsert) || !Array.isArray(changes.remove) || changes.upsert.length + changes.remove.length > 1000)
    throw new TypeError('Invalid file catalog changes.');
  const upsert = new Map();
  const remove = new Set(changes.remove);
  if (remove.size !== changes.remove.length || [...remove].some(id => typeof id !== 'string')) throw new TypeError('Invalid file catalog changes.');
  for (const file of changes.upsert) {
    if (!file || typeof file.id !== 'string' || upsert.has(file.id) || remove.has(file.id)) throw new TypeError('Invalid file catalog changes.');
    upsert.set(file.id, file);
  }
  const result = files.filter(file => !remove.has(file.id)).map(file => upsert.get(file.id) || file);
  const known = new Set(files.map(file => file.id));
  return [...result, ...changes.upsert.filter(file => !known.has(file.id))];
}
