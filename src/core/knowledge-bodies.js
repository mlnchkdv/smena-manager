import { getKnowledgeNote, getSessionGeneration } from './api.js';
import { D } from './store.js';
import { cacheKnowledgeBody, hydrateKnowledgeBody } from '../shared/knowledge-demand.js';
const requests = new Map();
const scope = () => JSON.stringify([getSessionGeneration(), D().ws.id || D().ws.url]);
export function knowledgeBodyState(note) {
  hydrateKnowledgeBody(note);
  if (!note?.bodyPending || typeof note.formatted_markdown === 'string') return { loaded: true };
  return requests.get(JSON.stringify([scope(), note.id, note.bodyToken])) || {};
}
export async function ensureKnowledgeBody(note, retry = false) {
  const state = knowledgeBodyState(note);
  if (state.loaded) return note;
  const owner = scope(),
    key = JSON.stringify([owner, note.id, note.bodyToken]);
  if (state.promise && !retry) return state.promise;
  if (state.error && !retry) throw state.error;
  const entry = { loading: true };
  requests.set(key, entry);
  entry.promise = getKnowledgeNote(note.id)
    .then(result => {
      const current = D().knowledgeNotes.find(item => item.id === note.id);
      if (scope() !== owner || current?.bodyToken !== note.bodyToken) throw Object.assign(new Error('Context changed'), { staleSession: true });
      if (result.bodyToken !== current.bodyToken) throw new Error('The note changed. Reload the catalog.');
      cacheKnowledgeBody(current.bodyToken, result.note.formatted_markdown, current);
      current.formatted_markdown = result.note.formatted_markdown;
      return current;
    })
    .catch(error => {
      entry.error = error;
      throw error;
    })
    .finally(() => {
      entry.loading = false;
      delete entry.promise;
    });
  return entry.promise;
}
export async function completeKnowledgeSnapshot(data) {
  const owner = scope(),
    notes = [];
  for (const note of data.knowledgeNotes || []) {
    const loaded = await ensureKnowledgeBody(note);
    if (owner !== scope()) throw Object.assign(new Error('Context changed'), { staleSession: true });
    const value = structuredClone(loaded);
    delete value.bodyToken;
    delete value.bodyPending;
    notes.push(value);
  }
  return { ...data, knowledgeNotes: notes };
}
