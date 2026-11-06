import { isDeepStrictEqual } from 'node:util';
import { getWorkspaceDatabase } from './workspace-store.js';
import { knowledgeActor } from './knowledge-access.js';
import { knowledgeCatalogDocument } from './knowledge-catalog.js';
import { replaceKnowledgeCatalog } from './knowledge-catalog-write.js';
import { NOTE_WRITE_FIELDS } from '../shared/knowledge-catalog-delta.js';
const fail = () => Object.assign(new Error('Invalid knowledge catalog delta.'), { statusCode: 400, code: 'INVALID_NOTE_PATCH' });
export async function applyKnowledgeCatalogDelta(delta, revision, profile, profiles = []) {
  if (!delta || typeof delta !== 'object' || Array.isArray(delta) || Object.keys(delta).some(key => !['knowledgeNotes', 'knowledgeFolders'].includes(key)))
    throw fail();
  const data = await getWorkspaceDatabase({
    fields: ['members', 'knowledgeNotes', 'knowledgeFolders', '_documentRevisions', 'createdAt', 'updatedAt'],
    knowledgeAuthorize: root => knowledgeActor(root, profile, profiles, { write: true }),
  });
  knowledgeActor(data, profile, profiles, { write: true });
  const before = knowledgeCatalogDocument(data),
    input = structuredClone(before);
  if (!Number.isSafeInteger(revision) || revision !== before.revision)
    throw Object.assign(new Error('The knowledge catalog changed.'), { statusCode: 409, code: 'REVISION_CONFLICT', currentRevision: before.revision });
  for (const field of ['knowledgeNotes', 'knowledgeFolders']) {
    const op = delta[field];
    if (!op || Object.keys(op).some(key => !['upsert', 'remove', 'order'].includes(key)) || !Array.isArray(op.upsert) || !Array.isArray(op.remove))
      throw fail();
    const map = new Map(input[field].map(row => [row.id, row])),
      changed = new Set();
    for (const row of op.upsert) {
      if (!row || typeof row.id !== 'string' || changed.has(row.id) || op.remove.includes(row.id)) throw fail();
      changed.add(row.id);
      if (field === 'knowledgeNotes' && Object.keys(row).some(key => !['id', 'bodyToken', ...NOTE_WRITE_FIELDS].includes(key))) throw fail();
      if (field === 'knowledgeNotes' && map.has(row.id) && row.bodyToken !== map.get(row.id).bodyToken)
        throw Object.assign(fail(), { code: 'KNOWLEDGE_BODY_STALE', statusCode: 409 });
      map.set(row.id, { ...map.get(row.id), ...row });
    }
    if (new Set(op.remove).size !== op.remove.length || op.remove.some(id => typeof id !== 'string' || !map.has(id))) throw fail();
    for (const id of op.remove) map.delete(id);
    if (op.order && (!Array.isArray(op.order) || op.order.length !== map.size || new Set(op.order).size !== map.size || op.order.some(id => !map.has(id))))
      throw fail();
    input[field] = op.order ? op.order.map(id => map.get(id)) : [...map.values()];
  }
  const saved = await replaceKnowledgeCatalog(input, revision, profile, profiles),
    changes = {};
  for (const field of ['knowledgeNotes', 'knowledgeFolders']) {
    const old = new Map(before[field].map(row => [row.id, row]));
    changes[field] = saved[field].filter(row => !isDeepStrictEqual(old.get(row.id), row));
  }
  const ack = { revision: saved.revision, createdAt: saved.createdAt, updatedAt: saved.updatedAt, changes };
  return Buffer.byteLength(JSON.stringify(ack)) > 3 * 1024 * 1024 ? { revision: saved.revision, paged: true } : ack;
}
