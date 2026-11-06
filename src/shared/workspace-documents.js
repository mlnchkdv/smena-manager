import { knowledgeNotePayload } from './knowledge-demand.js';
export const WORKSPACE_DOCUMENTS = Object.freeze({
  knowledge: Object.freeze(['knowledgeNotes', 'knowledgeFolders']),
  bookmarks: Object.freeze(['links', 'linkFolders']),
});

export const DOCUMENT_NAMES = Object.freeze(Object.keys(WORKSPACE_DOCUMENTS));
export const DOCUMENT_FIELDS = Object.freeze(Object.values(WORKSPACE_DOCUMENTS).flat());

// Core and document snapshots share one Drive aggregate. Serialize client-side
// writes so a fast edit cannot make sibling PUTs race on the same revision.
let serializedWrite = Promise.resolve();

export function serializeWorkspaceWrite(task) {
  const next = serializedWrite.catch(() => undefined).then(task);
  serializedWrite = next.catch(() => undefined);
  return next;
}

export function workspaceCoreData(data = {}) {
  const core = Object.fromEntries(Object.entries(data).filter(([key]) => !DOCUMENT_FIELDS.includes(key) && !key.startsWith('_')));
  if (Array.isArray(core.trash))
    core.trash = core.trash.map(item =>
      item.kind === 'note' && item.data?.note?.bodyPending ? { ...item, data: { ...item.data, note: knowledgeNotePayload(item.data.note) } } : item,
    );
  return core;
}

export function workspaceDocumentData(name, data = {}) {
  const fields = WORKSPACE_DOCUMENTS[name];
  if (!fields) throw new Error(`Unknown workspace document: ${name}`);
  return Object.fromEntries(
    fields.map(field => [field, Array.isArray(data[field]) ? (field === 'knowledgeNotes' ? data[field].map(knowledgeNotePayload) : data[field]) : []]),
  );
}

export function mergeWorkspaceDocuments(core = {}, documents = {}) {
  const merged = { ...core };
  for (const name of DOCUMENT_NAMES) Object.assign(merged, workspaceDocumentData(name, documents[name]?.data || documents[name] || {}));
  return merged;
}
