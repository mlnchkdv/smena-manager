import { createHash, randomUUID } from 'node:crypto';
import { knowledgeSnapshot } from '../shared/knowledge-history.js';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function fingerprint(note) {
  const snapshot = knowledgeSnapshot(note);
  delete snapshot.formatted_markdown;
  return hash({
    ...snapshot,
    body: note.bodyRef?.sha256 || hash({ format: 'smena-knowledge-body-v1', noteId: note.id, formatted_markdown: String(note.formatted_markdown || '') }),
    updatedAt: note.updatedAt || '',
    updatedBy: note.updatedBy || '',
  });
}
export function knowledgeEntityVersion(note) {
  const stored = note?._apiVersion;
  if (Number.isSafeInteger(stored?.number) && stored.number > 0 && /^[a-z0-9-]{1,80}$/.test(stored.generation || '')) return stored;
  return { number: 1, generation: 'legacy-' + fingerprint(note).slice(0, 32) };
}
export function knowledgeEntityEtag(note) {
  const { number, generation } = knowledgeEntityVersion(note);
  return `"kn.${hash(note.id).slice(0, 16)}.${generation}.${number}"`;
}

// Runs inside the canonical write boundary, after the mutator, for browser,
// import, restore and API writes alike. Client-supplied version fields are ignored.
export function stampKnowledgeEntityVersions(current, next, { reset = false, apiSource = false } = {}) {
  if (!Array.isArray(next.knowledgeNotes)) return;
  const before = new Map((current.knowledgeNotes || []).map(note => [note.id, note]));
  for (const note of next.knowledgeNotes) {
    const previous = before.get(note.id);
    if (!apiSource) {
      if (!reset && previous && fingerprint(previous) === fingerprint(note) && previous.updatedVia) note.updatedVia = structuredClone(previous.updatedVia);
      else delete note.updatedVia;
    }
    if (!previous) note._apiVersion = { number: 1, generation: randomUUID() };
    else {
      const version = knowledgeEntityVersion(previous);
      if (reset || fingerprint(previous) !== fingerprint(note))
        note._apiVersion = { number: version.number + 1, generation: reset || !previous._apiVersion ? randomUUID() : version.generation };
      else if (previous._apiVersion) note._apiVersion = { ...version };
      else delete note._apiVersion;
    }
  }
}
