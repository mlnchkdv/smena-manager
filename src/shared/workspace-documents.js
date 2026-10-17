export const WORKSPACE_DOCUMENTS = Object.freeze({
  knowledge: Object.freeze(['knowledgeNotes', 'knowledgeFolders']),
  bookmarks: Object.freeze(['links', 'linkFolders']),
});

export const DOCUMENT_NAMES = Object.freeze(Object.keys(WORKSPACE_DOCUMENTS));
export const DOCUMENT_FIELDS = Object.freeze(Object.values(WORKSPACE_DOCUMENTS).flat());

export function workspaceCoreData(data = {}) {
  return Object.fromEntries(Object.entries(data).filter(([key]) => !DOCUMENT_FIELDS.includes(key)));
}

export function workspaceDocumentData(name, data = {}) {
  const fields = WORKSPACE_DOCUMENTS[name];
  if (!fields) throw new Error(`Unknown workspace document: ${name}`);
  return Object.fromEntries(fields.map(field => [field, Array.isArray(data[field]) ? data[field] : []]));
}

export function mergeWorkspaceDocuments(core = {}, documents = {}) {
  const merged = { ...core };
  for (const name of DOCUMENT_NAMES) Object.assign(merged, workspaceDocumentData(name, documents[name]?.data || documents[name] || {}));
  return merged;
}
