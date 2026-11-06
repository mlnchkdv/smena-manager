import { getWorkspaceDatabase } from './workspace-store.js';
import { knowledgeActor } from './knowledge-access.js';
import { knowledgeCatalogNote } from './knowledge-catalog.js';
const fail = (code, statusCode = 400) => Object.assign(new Error('The knowledge catalog changed or the requested page is invalid.'), { code, statusCode });
const fields = ['knowledgeNotes', 'knowledgeFolders'];
export async function readKnowledgeCatalogPage(query, profile, profiles = []) {
  const field = query.collection || 'knowledgeNotes',
    offset = Number(query.offset || 0);
  const limit = Math.min(100, Number(query.limit || 100));
  if (!fields.includes(field) || !Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1) throw fail('INVALID_NOTE_PATCH');
  const base = await getWorkspaceDatabase({
    knowledge: false,
    fields: ['members', field, '_documentRevisions', 'createdAt', 'updatedAt'],
    knowledgeAuthorize: root => knowledgeActor(root, profile, profiles),
  });
  knowledgeActor(base, profile, profiles);
  const meta = base._documentRevisions?.knowledge || {},
    revision = Number(meta.revision || 0);
  if (query.revision !== undefined && Number(query.revision) !== revision) throw Object.assign(fail('REVISION_CONFLICT', 409), { currentRevision: revision });
  const ids = (base[field] || []).slice(offset, offset + limit).map(row => row.id);
  const selected = await getWorkspaceDatabase({
    fields: ['members', field, '_documentRevisions'],
    knowledgeIds: { [field]: ids },
    knowledgeAuthorize: root => knowledgeActor(root, profile, profiles),
  });
  knowledgeActor(selected, profile, profiles);
  if (Number(selected._documentRevisions?.knowledge?.revision || 0) !== revision)
    throw Object.assign(fail('REVISION_CONFLICT', 409), { currentRevision: Number(selected._documentRevisions?.knowledge?.revision || 0) });
  const map = new Map((selected[field] || []).map(row => [row.id, row])),
    rows = [];
  let bytes = 0;
  for (const id of ids) {
    const value = map.get(id);
    if (!value) throw fail('KNOWLEDGE_METADATA_INTEGRITY', 503);
    const row = field === 'knowledgeNotes' ? knowledgeCatalogNote(value) : value,
      size = Buffer.byteLength(JSON.stringify(row));
    if (size > 3 * 1024 * 1024) throw fail('WORKSPACE_TOO_LARGE', 413);
    if (rows.length && bytes + size > 256 * 1024) break;
    rows.push(row);
    bytes += size;
  }
  const total = (base[field] || []).length,
    end = offset + rows.length;
  return {
    schemaVersion: 1,
    revision,
    createdAt: meta.createdAt || base.createdAt,
    updatedAt: meta.updatedAt || base.updatedAt,
    collection: field,
    offset,
    total,
    rows,
    nextOffset: end < total ? end : null,
  };
}
