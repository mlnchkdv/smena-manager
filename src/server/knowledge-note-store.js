import { isDeepStrictEqual } from 'node:util';
import { randomUUID } from 'node:crypto';
import { knowledgeEntityEtag, knowledgeEntityVersion } from './knowledge-entity-version.js';
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
    etag: knowledgeEntityEtag(record),
    version: knowledgeEntityVersion(record).number,
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
          const changed = await applyKnowledgeNotePatch(data, noteId, patch, actor, { hash: expectedHash });
          if (changed.unchanged)
            throw Object.assign(new Error('Note unchanged.'), {
              code: 'KNOWLEDGE_NOTE_UNCHANGED',
              result: {
                note: changed.note,
                noteHash: expectedHash,
                etag: knowledgeEntityEtag(changed.note),
                version: knowledgeEntityVersion(changed.note).number,
                revision: Number(data._documentRevisions?.knowledge?.revision || 0),
              },
            });
          selected = changed.note;
          return data;
        },
        baseline.revision,
        { role: 'admin', scope: 'knowledge' },
      );
      const record = saved.knowledgeNotes.find(note => note.id === noteId);
      return {
        note: { ...selected, _apiVersion: record._apiVersion },
        etag: knowledgeEntityEtag(record),
        version: knowledgeEntityVersion(record).number,
        noteHash: knowledgeSnapshotHash(selected),
        revision: Number(saved._documentRevisions?.knowledge?.revision || 0),
      };
    } catch (error) {
      if (error.code === 'KNOWLEDGE_NOTE_UNCHANGED') return error.result;
      if (error.code !== 'REVISION_CONFLICT' || attempt === 2) throw error;
    }
  }
}

// A single-note create command. External clients never submit a complete catalog
// or choose identities, actor fields, history or storage pointers.
export async function createKnowledgeNote(values, profile, profiles = []) {
  if (!values || typeof values !== 'object' || Array.isArray(values) || Object.keys(values).some(key => !EDITABLE.has(key)))
    throw Object.assign(new TypeError('Invalid note fields.'), { code: 'INVALID_NOTE_PATCH', statusCode: 422 });
  const id = 'kn' + randomUUID();
  for (let attempt = 0; attempt < 3; attempt++) {
    const baseline = await getWorkspaceDatabase({ fields: ['revision'] });
    try {
      const saved = await mutateWorkspaceMetadata(
        async data => {
          const actor = knowledgeActor(data, profile, profiles, { write: true });
          await applyKnowledgeNoteCreate(data, { id, ...structuredClone(values) }, actor);
          return data;
        },
        baseline.revision,
        { role: 'admin', scope: 'knowledge' },
      );
      return readKnowledgeNote(saved.knowledgeNotes.find(note => note.id === id).id, profile, profiles);
    } catch (error) {
      if (error.code !== 'REVISION_CONFLICT' || attempt === 2) throw error;
    }
  }
}

export async function applyKnowledgeNoteCreate(data, values, actor) {
  if (data.knowledgeNotes.some(note => note.id === values.id))
    throw Object.assign(new Error('Note identity already exists.'), { code: 'NOTE_EXISTS', statusCode: 409 });
  const now = new Date().toISOString();
  const note = {
    title: '',
    summary: '',
    formatted_markdown: '',
    folderId: null,
    tags: [],
    aliases: [],
    typeId: 'note',
    properties: {},
    ...values,
    createdAt: now,
    updatedAt: now,
    createdBy: actor.id,
    updatedBy: actor.id,
    history: [],
  };
  validateDocumentInput('knowledge', { knowledgeNotes: [note], knowledgeFolders: data.knowledgeFolders });
  note.wikilinks = extractWikiLinks(note.formatted_markdown);
  bindWikiReferences([note, ...data.knowledgeNotes]);
  data.knowledgeNotes.push(await storeKnowledgeBody(getStorageProvider(), note));
  const previous = data._documentRevisions?.knowledge || {};
  data._documentRevisions = {
    ...data._documentRevisions,
    knowledge: { revision: Number(previous.revision || 0) + 1, createdAt: previous.createdAt || data.createdAt, updatedAt: now },
  };
  return note;
}

// Shared by the browser patch endpoint and the external API, inside its caller's
// canonical mutation. Authorization is performed against that locked database.
export async function applyKnowledgeNotePatch(data, noteId, patch, actor, guard = {}) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch) || Object.keys(patch).some(field => !EDITABLE.has(field)))
    throw Object.assign(new Error('Invalid note patch.'), { code: 'INVALID_NOTE_PATCH', statusCode: 422 });
  const index = data.knowledgeNotes.findIndex(note => note.id === noteId);
  if (index < 0) throw missing();
  const record = data.knowledgeNotes[index];
  if (!guard.etag && !guard.hash) throw Object.assign(new Error('A note version is required.'), { code: 'PRECONDITION_REQUIRED', statusCode: 428 });
  if (guard.etag && guard.etag !== knowledgeEntityEtag(record))
    throw Object.assign(new Error('Note changed.'), { code: 'NOTE_VERSION_CONFLICT', statusCode: 412 });
  const previous = await loadKnowledgeBody(getStorageProvider(), record);
  if (guard.hash && knowledgeSnapshotHash(previous) !== guard.hash)
    throw Object.assign(new Error('Note changed.'), { code: 'KNOWLEDGE_VERSION_STALE', statusCode: 409 });
  const next = { ...previous, ...structuredClone(patch) };
  validateDocumentInput('knowledge', { knowledgeNotes: [next], knowledgeFolders: data.knowledgeFolders });
  if (isDeepStrictEqual(previous, next)) return { note: previous, unchanged: true };
  next.updatedBy = actor.id;
  next.updatedAt = new Date().toISOString();
  if (guard.integration) next.updatedVia = { id: guard.integration.id, name: guard.integration.name };
  else delete next.updatedVia;
  if (Object.hasOwn(patch, 'formatted_markdown')) next.wikilinks = extractWikiLinks(next.formatted_markdown);
  bindWikiReferences([next, ...data.knowledgeNotes.filter(note => note.id !== noteId)]);
  next.history = await storedNoteHistory(getStorageProvider(), previous, next, Date.now(), {
    force: !!guard.integration,
    integrationName: guard.integration?.name,
  });
  data.knowledgeNotes[index] = externalKnowledgeBody(record) ? await storeKnowledgeBody(getStorageProvider(), next) : next;
  const metadata = data._documentRevisions?.knowledge || {};
  data._documentRevisions = {
    ...data._documentRevisions,
    knowledge: { revision: Number(metadata.revision || 0) + 1, createdAt: metadata.createdAt || data.createdAt, updatedAt: next.updatedAt },
  };
  return { note: next, unchanged: false };
}
