import { catalogDelta, acknowledgeCatalog } from '../shared/knowledge-catalog-delta.js';
import { workspaceTransportBytes, WORKSPACE_TRANSPORT_MAX_BYTES } from '../shared/workspace-size.js';
let generation;
const snapshots = new Map();
const fail = (code, status = 409) => Object.assign(new Error('The knowledge catalog changed. Reload it and retry.'), { code, status });
function remember(data, session) {
  if (generation !== session) {
    snapshots.clear();
    generation = session;
  }
  snapshots.set(data.revision, structuredClone(data));
  while (snapshots.size > 2) snapshots.delete(snapshots.keys().next().value);
  return data;
}
export async function readKnowledgePages(request, session, check, expected) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const data = { schemaVersion: 1, knowledgeNotes: [], knowledgeFolders: [] };
    let revision = expected;
    try {
      for (const collection of ['knowledgeNotes', 'knowledgeFolders']) {
        let offset = 0,
          total;
        do {
          check(session);
          const query = new URLSearchParams({ page: '1', collection, offset: String(offset) });
          if (revision !== undefined) query.set('revision', String(revision));
          const page = (await request('/api/knowledge/catalog?' + query, {}, true)).data;
          check(session);
          if (
            !Number.isSafeInteger(page.revision) ||
            page.offset !== offset ||
            page.collection !== collection ||
            !Array.isArray(page.rows) ||
            !Number.isSafeInteger(page.total) ||
            page.total < 0
          )
            throw fail('KNOWLEDGE_METADATA_INTEGRITY', 503);
          if (revision !== undefined && page.revision !== revision) throw fail('REVISION_CONFLICT');
          revision = page.revision;
          if (total !== undefined && page.total !== total) throw fail('REVISION_CONFLICT');
          total = page.total;
          if (page.nextOffset !== null && (page.nextOffset !== offset + page.rows.length || page.nextOffset <= offset || page.nextOffset >= total))
            throw fail('KNOWLEDGE_METADATA_INTEGRITY', 503);
          data[collection].push(...page.rows);
          Object.assign(data, { revision, createdAt: page.createdAt, updatedAt: page.updatedAt });
          offset = page.nextOffset;
        } while (offset !== null);
        if (data[collection].length !== total || new Set(data[collection].map(row => row.id)).size !== total) throw fail('KNOWLEDGE_METADATA_INTEGRITY', 503);
      }
      return remember(data, session);
    } catch (error) {
      if (error.code !== 'REVISION_CONFLICT' || expected !== undefined || attempt === 2) throw error;
    }
  }
}
export async function writeKnowledgeDelta(data, revision, request, session, check) {
  check(session);
  const baseline = generation === session && snapshots.get(revision);
  if (!baseline) throw fail('REVISION_CONFLICT');
  const delta = catalogDelta(baseline, data),
    actualBytes = workspaceTransportBytes(delta, revision);
  if (actualBytes > WORKSPACE_TRANSPORT_MAX_BYTES)
    throw Object.assign(fail('WORKSPACE_TOO_LARGE', 413), { actualBytes, maxBytes: WORKSPACE_TRANSPORT_MAX_BYTES });
  const { data: ack } = await request('/api/knowledge/catalog', { method: 'PATCH', body: JSON.stringify({ delta, revision }) }, true);
  check(session);
  if (ack.paged) return readKnowledgePages(request, session, check, ack.revision);
  return remember(acknowledgeCatalog(data, ack), session);
}
