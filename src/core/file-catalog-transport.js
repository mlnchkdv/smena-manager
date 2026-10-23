import { fileCatalogChanges } from '../shared/file-catalog.js';
import { setFileCatalogInfo } from './file-catalog-state.js';
export { fileCatalogInfo } from './file-catalog-state.js';

let generation;
const baselines = new Map();
let manifest = null;
let wanted = new Set();
function scope(next) {
  if (generation !== next) {
    baselines.clear();
    generation = next;
    manifest = null;
    setFileCatalogInfo(null);
    wanted = new Set();
  }
}
export function requestFileIdentities(ids, session, replace = false) {
  scope(session);
  if (replace) wanted = new Set();
  for (const id of ids) if (typeof id === 'string' && id) wanted.add(id);
}
export async function hydrateFileCatalog(result, request, session) {
  scope(session);
  if (!result.fileCatalog) return result.data;
  if (result.fileCatalog.mode === 'demand') {
    const revision = result.data.revision;
    const files = [];
    const identities = [...wanted];
    for (let i = 0; i < identities.length; i += 100) {
      let offset = 0;
      do {
        const page = await request('/api/files/catalog/resolve', {
          method: 'POST',
          body: JSON.stringify({ revision, token: result.fileCatalog.token, ids: identities.slice(i, i + 100), offset }),
        });
        if (generation !== session) throw Object.assign(new Error('The signed-in account changed. Sign in again.'), { staleSession: true });
        const next = page.nextOffset ?? null;
        if (
          page.revision !== revision ||
          !Array.isArray(page.files) ||
          page.files.some(file => !identities.slice(i, i + 100).includes(file.id)) ||
          (next !== null && (!Number.isSafeInteger(next) || next <= offset || next > 100))
        )
          throw new Error('Invalid file catalog page.');
        files.push(...page.files);
        offset = next;
      } while (offset !== null);
    }
    if (new Set(files.map(file => file.id)).size !== files.length) throw new Error('Invalid file catalog page.');
    manifest = { ...result.fileCatalog, revision };
    setFileCatalogInfo(manifest);
    baselines.set(revision, {
      token: manifest.token,
      files: structuredClone(files),
      partial: true,
      trashIds: new Set((result.data.trash || []).map(item => item.id)),
    });
    while (baselines.size > 2) baselines.delete(baselines.keys().next().value);
    return { ...result.data, files };
  }
  const files = [];
  const revision = result.data.revision;
  const cached = result.fileCatalog.token && [...baselines.values()].find(entry => entry.token === result.fileCatalog.token);
  if (cached && cached.files.length === result.fileCatalog.total) {
    baselines.set(revision, cached);
    while (baselines.size > 2) baselines.delete(baselines.keys().next().value);
    return { ...result.data, files: structuredClone(cached.files) };
  }
  let offset = 0;
  do {
    const page = await request(
      `/api/files/catalog?revision=${revision}&offset=${offset}${result.fileCatalog.token ? `&token=${encodeURIComponent(result.fileCatalog.token)}` : ''}`,
    );
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
  baselines.set(revision, { token: result.fileCatalog.token, files: structuredClone(files) });
  while (baselines.size > 2) baselines.delete(baselines.keys().next().value);
  return { ...result.data, files };
}
export function catalogWrite(data, revision, session) {
  scope(session);
  const base = baselines.get(revision);
  if (manifest?.mode === 'demand' && (!base || !Array.isArray(data.files))) throw new Error('Reload the workspace before saving file changes.');
  if (!base || !Array.isArray(data.files)) return { data };
  const { files, ...core } = data;
  if (base.partial)
    requestFileIdentities(
      files.map(file => file.id),
      session,
      true,
    );
  const changes = fileCatalogChanges(base.files, files);
  if (base.partial) {
    // Scope/page changes and concurrent read responses can remove cached rows
    // without expressing deletion. Only a newly-created trash command removes
    // a file; project/task cascades are completed independently on the server.
    const removed = new Set((data.trash || []).filter(item => !base.trashIds.has(item.id) && item.kind === 'file').map(item => item.data?.file?.id));
    changes.remove = changes.remove.filter(id => removed.has(id));
  }
  return { data: core, fileChanges: changes };
}
