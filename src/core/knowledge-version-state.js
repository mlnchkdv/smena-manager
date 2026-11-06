import { getKnowledgeNoteVersion, getSessionGeneration } from './api.js';
import { D } from './store.js';
import { externalKnowledgeVersion } from '../shared/knowledge-history.js';

let owner;
const entries = new Map();
const scope = () => JSON.stringify([getSessionGeneration(), D().ws.id || D().ws.url]);
const keyFor = (noteId, version) => {
  const current = scope();
  if (owner !== current) {
    entries.clear();
    owner = current;
  }
  return JSON.stringify([current, noteId, version.id, version.contentRef?.sha256 || 'inline']);
};
export function knowledgeVersionState(noteId, version) {
  if (!externalKnowledgeVersion(version)) return { value: version };
  return entries.get(keyFor(noteId, version)) || {};
}
export function loadKnowledgeVersion(noteId, version) {
  if (!externalKnowledgeVersion(version)) return Promise.resolve(version);
  const key = keyFor(noteId, version),
    current = owner,
    existing = entries.get(key);
  if (existing?.value) return Promise.resolve(existing.value);
  if (existing?.promise) return existing.promise;
  const entry = { loading: true };
  entries.set(key, entry);
  entry.promise = getKnowledgeNoteVersion(noteId, version.id)
    .then(result => {
      if (scope() !== current) throw Object.assign(new Error('Context changed.'), { staleSession: true });
      entry.value = result.version;
      entry.bytes = new TextEncoder().encode(JSON.stringify(entry.value)).length;
      let total = [...entries.values()].reduce((sum, item) => sum + (item.bytes || 0), 0);
      for (const [oldKey, item] of entries) {
        if (total <= 16 * 1024 * 1024 && entries.size <= 20) break;
        if (oldKey !== key && item.value) {
          total -= item.bytes;
          entries.delete(oldKey);
        }
      }
      return entry.value;
    })
    .catch(error => {
      entry.error = true;
      throw error;
    })
    .finally(() => {
      entry.loading = false;
      delete entry.promise;
    });
  return entry.promise;
}
