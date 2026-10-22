import { fileCatalogChanges } from '../shared/file-catalog.js';

let generation;
const baselines = new Map();
function scope(next) {
  if (generation !== next) {
    baselines.clear();
    generation = next;
  }
}
export async function hydrateFileCatalog(result, request, session) {
  scope(session);
  if (!result.fileCatalog) return result.data;
  const files = [];
  const revision = result.data.revision;
  let offset = 0;
  do {
    const page = await request(`/api/files/catalog?revision=${revision}&offset=${offset}`);
    if (
      page.revision !== revision ||
      page.total !== result.fileCatalog.total ||
      !Array.isArray(page.files) ||
      (page.nextOffset !== null && page.nextOffset <= offset)
    )
      throw new Error('Invalid file catalog page.');
    files.push(...page.files);
    offset = page.nextOffset;
  } while (offset !== null);
  if (files.length !== result.fileCatalog.total || new Set(files.map(file => file.id)).size !== files.length) throw new Error('Invalid file catalog page.');
  baselines.set(revision, structuredClone(files));
  while (baselines.size > 4) baselines.delete(baselines.keys().next().value);
  return { ...result.data, files };
}
export function catalogWrite(data, revision, session) {
  scope(session);
  const base = baselines.get(revision);
  if (!base || !Array.isArray(data.files)) return { data };
  const { files, ...core } = data;
  return { data: core, fileChanges: fileCatalogChanges(base, files) };
}
