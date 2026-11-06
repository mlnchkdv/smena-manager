const bodies = new Map();
let bytes = 0;
export const cachedKnowledgeBody = token => bodies.get(token)?.body;
const track = (entry, record) => {
  for (const reference of entry.records) if (!reference.deref()) entry.records.delete(reference);
  if (record && ![...entry.records].some(reference => reference.deref() === record)) entry.records.add(new WeakRef(record));
};
export function clearKnowledgeBodies() {
  bodies.clear();
  bytes = 0;
}
export function cacheKnowledgeBody(token, body, record) {
  if (!/^[a-f0-9]{64}$/.test(token || '') || typeof body !== 'string') return;
  let entry = bodies.get(token);
  if (!entry) {
    entry = { body, bytes: new TextEncoder().encode(body).length, records: new Set() };
    bodies.set(token, entry);
    bytes += entry.bytes;
  }
  track(entry, record);
  for (const [key, old] of bodies) {
    if (bytes <= 32 * 1024 * 1024 && bodies.size <= 40) break;
    if (key === token) continue;
    for (const reference of old.records) {
      const note = reference.deref();
      if (note?.bodyToken === key && note.formatted_markdown === old.body) delete note.formatted_markdown;
    }
    bodies.delete(key);
    bytes -= old.bytes;
  }
}
export function hydrateKnowledgeBody(note) {
  if (!note?.bodyPending || typeof note.formatted_markdown === 'string') return note;
  const entry = bodies.get(note.bodyToken);
  if (entry) {
    note.formatted_markdown = entry.body;
    track(entry, note);
  }
  return note;
}
export function knowledgeNotePayload(note) {
  if (!note?.bodyPending) return note;
  const value = { ...note };
  if (value.formatted_markdown === bodies.get(note.bodyToken)?.body) delete value.formatted_markdown;
  return value;
}
