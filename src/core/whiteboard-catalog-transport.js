import { emptyWhiteboard, validWhiteboard } from '../shared/project-whiteboard.js';
let generation,
  manifest = null,
  wanted = '',
  loaded = new Set();
const cache = new Map();
const metadata = b => {
  const copy = { ...b };
  delete copy.whiteboard;
  return copy;
};
const reset = session => {
  if (generation !== session) {
    generation = session;
    manifest = null;
    wanted = '';
    loaded.clear();
    cache.clear();
  }
};
export function wantWhiteboard(id, session) {
  reset(session);
  wanted = id;
}
export const whiteboardDemandEnabled = () => !!manifest;
export const whiteboardCatalogInfo = id => manifest?.entries.find(e => e.id === id);
export const whiteboardBodyAvailable = id => !manifest || loaded.has(id);
export async function hydrateWhiteboards(result, request, session) {
  reset(session);
  if (!result.whiteboardCatalog) return result.data;
  if (result.whiteboardCatalog.version !== 1 || !Array.isArray(result.whiteboardCatalog.entries)) throw new Error('Invalid whiteboard catalog.');
  const infos = new Map(result.whiteboardCatalog.entries.map(e => [e.id, e]));
  const metadata = result.data.whiteboards || [];
  if (infos.size !== metadata.length || metadata.some(b => !infos.has(b.id))) throw new Error('Invalid whiteboard catalog.');
  const next = [];
  const attached = new Set();
  for (const b of metadata) {
    const info = infos.get(b.id);
    let value;
    if (b.id === wanted) {
      const cached = cache.get(b.id);
      value = cached?.hash === info.hash ? cached : await request(`/api/whiteboards/${encodeURIComponent(b.id)}/content?revision=${result.data.revision}`);
      if (generation !== session) throw Object.assign(new Error('The account changed.'), { staleSession: true });
      if (value.hash !== info.hash || !validWhiteboard(value.board))
        throw Object.assign(new Error('The whiteboard changed.'), { code: 'REVISION_CONFLICT', status: 409 });
      cache.set(b.id, structuredClone(value));
      attached.add(b.id);
    }
    next.push({ ...b, whiteboard: value ? structuredClone(value.board) : emptyWhiteboard() });
  }
  for (const id of cache.keys()) if (!infos.has(id) || cache.size > 3) cache.delete(id);
  manifest = structuredClone(result.whiteboardCatalog);
  loaded = attached;
  return { ...result.data, whiteboards: next };
}
export function whiteboardCatalogWrite(data, session) {
  reset(session);
  if (!manifest) return data;
  const known = new Set(manifest.entries.map(e => e.id));
  return {
    ...data,
    projects: data.projects.map(metadata),
    whiteboards: (data.whiteboards || []).map(b => {
      if (!known.has(b.id) || (loaded.has(b.id) && JSON.stringify(b.whiteboard) !== JSON.stringify(cache.get(b.id)?.board))) return b;
      return metadata(b);
    }),
  };
}
