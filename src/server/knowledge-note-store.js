import { isDeepStrictEqual } from 'node:util';
import { getWorkspaceDatabase, mutateWorkspaceMetadata } from './workspace-store.js';
import { getStorageProvider } from './storage/index.js';
import { knowledgeActor } from './knowledge-access.js';
import { loadKnowledgeBody, storeKnowledgeBody } from './knowledge-body-store.js';
import { externalKnowledgeBody } from '../shared/knowledge-body.js';
import { storedNoteHistory } from './knowledge-version-blobs.js';
import { knowledgeSnapshotHash } from './knowledge-versions.js';
import { validateDocumentInput } from '../shared/workspace-schema.js';
import { bindWikiReferences, extractWikiLinks } from '../shared/knowledge-links.js';
import { knowledgeBodyToken, knowledgeCatalogNote } from './knowledge-catalog.js';

const EDITABLE = new Set([
  'title',
  'summary',
  'formatted_markdown',
  'category',
  'folderId',
  'tags',
  'typeId',
  'properties',
  'aliases',
  'tagAliases',
  'captureStatus',
  'assets',
  'materialTargets',
  'favorite',
]);
const missing = () => Object.assign(new Error('Note not found.'), { code: 'KNOWLEDGE_NOT_FOUND', statusCode: 404 });

export async function readKnowledgeNote(noteId, profile, profiles = []) {
  const data = await getWorkspaceDatabase({
    fields: ['members', 'knowledgeNotes', '_documentRevisions'],
    knowledgeIds: [noteId],
    knowledgeAuthorize: root => knowledgeActor(root, profile, profiles),
  });
  knowledgeActor(data, profile, profiles);
  const record = data.knowledgeNotes?.find(note => note.id === noteId);
  if (!record) throw missing();
  const note = await loadKnowledgeBody(getStorageProvider(), record);
  if (Array.isArray(record.history)) note.history = knowledgeCatalogNote(record).history;
  return {
    note,
    bodyToken: knowledgeBodyToken(record),
    noteHash: knowledgeSnapshotHash(note),
    revision: Number(data._documentRevisions?.knowledge?.revision || 0),
  };
}

export async function patchKnowledgeNote(noteId, patch, expectedHash, profile, profiles = []) {
  if (
    !patch ||
    typeof patch !== 'object' ||
    Array.isArray(patch) ||
    Object.keys(patch).some(field => !EDITABLE.has(field)) ||
    !/^[a-f0-9]{64}$/.test(expectedHash || '')
  )
    throw Object.assign(new TypeError('Invalid note patch.'), { code: 'INVALID_NOTE_PATCH', statusCode: 400 });
  for (const field of ['title', 'summary', 'formatted_markdown', 'category', 'typeId'])
    if (Object.hasOwn(patch, field) && typeof patch[field] !== 'string')
      throw Object.assign(new TypeError('Invalid note patch.'), { code: 'INVALID_NOTE_PATCH', statusCode: 400 });
  if (Object.hasOwn(patch, 'favorite') && typeof patch.favorite !== 'boolean')
    throw Object.assign(new TypeError('Invalid note patch.'), { code: 'INVALID_NOTE_PATCH', statusCode: 400 });
  for (let attempt = 0; attempt < 3; attempt++) {
    const baseline = await getWorkspaceDatabase({ fields: ['revision'] });
    try {
      let selected;
      const saved = await mutateWorkspaceMetadata(
        async data => {
          const actor = knowledgeActor(data, profile, profiles, { write: true });
          const index = data.knowledgeNotes?.findIndex(note => note.id === noteId);
          if (!(index >= 0)) throw missing();
          const record = data.knowledgeNotes[index];
          const previous = await loadKnowledgeBody(getStorageProvider(), record);
          if (knowledgeSnapshotHash(previous) !== expectedHash)
            throw Object.assign(new Error('The note changed. Review its version again.'), { code: 'KNOWLEDGE_VERSION_STALE', statusCode: 409 });
          const next = { ...previous, ...structuredClone(patch) };
          validateDocumentInput('knowledge', { knowledgeNotes: [next], knowledgeFolders: data.knowledgeFolders });
          if (isDeepStrictEqual(previous, next))
            throw Object.assign(new Error('Note unchanged.'), {
              code: 'KNOWLEDGE_NOTE_UNCHANGED',
              result: { note: previous, noteHash: expectedHash, revision: Number(data._documentRevisions?.knowledge?.revision || 0) },
            });
          next.updatedBy = actor.id;
          next.updatedAt = new Date().toISOString();
          if (Object.hasOwn(patch, 'formatted_markdown')) next.wikilinks = extractWikiLinks(next.formatted_markdown);
          // Preserve resolved identities through title changes and bind new links
          // against metadata for all other notes, without reading their bodies.
          bindWikiReferences([next, ...data.knowledgeNotes.filter(note => note.id !== noteId)]);
          next.history = await storedNoteHistory(getStorageProvider(), previous, next);
          data.knowledgeNotes[index] = externalKnowledgeBody(record) ? await storeKnowledgeBody(getStorageProvider(), next) : next;
          const metadata = data._documentRevisions?.knowledge || {};
          data._documentRevisions = {
            ...data._documentRevisions,
            knowledge: {
              revision: Number(metadata.revision || 0) + 1,
              createdAt: metadata.createdAt || data.createdAt,
              updatedAt: next.updatedAt,
            },
          };
          selected = next;
          return data;
        },
        baseline.revision,
        { role: 'admin', scope: 'knowledge' },
      );
      return { note: selected, noteHash: knowledgeSnapshotHash(selected), revision: Number(saved._documentRevisions?.knowledge?.revision || 0) };
    } catch (error) {
      if (error.code === 'KNOWLEDGE_NOTE_UNCHANGED') return error.result;
      if (error.code !== 'REVISION_CONFLICT' || attempt === 2) throw error;
    }
  }
}
