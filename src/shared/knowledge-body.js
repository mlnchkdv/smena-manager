// This is a storage format, not an access capability. Public reads must resolve
// the note through the current authenticated workspace before using its ref.
export const KNOWLEDGE_BODY_KIND = 'knowledge-body-v1';
export const KNOWLEDGE_BODY_MAX_BYTES = 8 * 1024 * 1024;
export const externalKnowledgeBody = note => note?.bodyRef?.kind === KNOWLEDGE_BODY_KIND;

export function validKnowledgeBodyRef(value) {
  return (
    value?.kind === KNOWLEDGE_BODY_KIND &&
    /^[a-f0-9]{64}$/.test(value.sha256 || '') &&
    Number.isSafeInteger(value.bytes) &&
    value.bytes > 0 &&
    value.bytes <= KNOWLEDGE_BODY_MAX_BYTES
  );
}

// A deterministic bounded migration window. The caller publishes staged refs
// only with a successful root CAS; a failed/aborted window keeps the old root.
export function knowledgeBodyMigrationWindow(notes, { after = '', limit = 10 } = {}) {
  const ordered = notes
    .filter(note => !externalKnowledgeBody(note))
    .map(note => note.id)
    .sort();
  const remaining = after ? ordered.filter(id => id > after) : ordered;
  const size = Math.min(20, Math.max(1, Math.floor(Number(limit) || 10)));
  const ids = remaining.slice(0, size);
  return { ids, remaining: remaining.length, next: remaining.length > ids.length ? ids.at(-1) : null };
}
