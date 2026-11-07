import { materialLink } from './material-links.js';

export const KNOWLEDGE_BODY_LINK_LIMIT = 512;
const validKey = key => typeof key === 'string' && /^(note|project|task|bookmark|file|whiteboard):[\p{L}\p{N}_.:@+-]{1,180}$/u.test(key);

// Derived from the exact immutable body. Relative asset mappings remain in
// note metadata and are resolved independently, so metadata edits do not stale
// this index. Keep the source intact when a very dense note exceeds the cap.
export function indexKnowledgeBodyLinks(source, sha256) {
  const refs = new Map();
  let complete = true;
  const add = (key, syntax) => {
    const id = syntax + ':' + key;
    if (refs.has(id)) return;
    if (refs.size === KNOWLEDGE_BODY_LINK_LIMIT) complete = false;
    else refs.set(id, { key, syntax });
  };
  for (const match of String(source || '').matchAll(/smena-file:([\p{L}\p{N}_.:@+-]{1,180})/gu)) add('file:' + match[1], 'media');
  for (const match of String(source || '').matchAll(/\[\[([^\]\n]+)\]\]/g)) {
    const ref = materialLink(match[1]);
    if (ref) add(ref.key, 'inline');
  }
  return { version: 1, sha256, complete, refs: [...refs.values()] };
}

export function validKnowledgeBodyLinks(note) {
  const index = note?.bodyLinks;
  return !!(
    index?.version === 1 &&
    /^[a-f0-9]{64}$/.test(index.sha256 || '') &&
    index.sha256 === (note.bodyRef?.sha256 || note.bodyToken) &&
    typeof index.complete === 'boolean' &&
    Array.isArray(index.refs) &&
    index.refs.length <= KNOWLEDGE_BODY_LINK_LIMIT &&
    index.refs.every(ref => ref && validKey(ref.key) && (ref.syntax === 'inline' || (ref.syntax === 'media' && ref.key.startsWith('file:')))) &&
    new Set(index.refs.map(ref => ref.syntax + ':' + ref.key)).size === index.refs.length
  );
}

export function coldKnowledgeBodyLinks(note) {
  return validKnowledgeBodyLinks(note) ? note.bodyLinks.refs : [];
}
