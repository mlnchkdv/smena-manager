import { isDeepStrictEqual } from 'node:util';
import { getWorkspaceDatabase, mutateWorkspaceMetadata } from './workspace-store.js';
import { getStorageProvider } from './storage/index.js';
import { knowledgeActor } from './knowledge-access.js';
import { knowledgeBodyToken, knowledgeCatalogDocument } from './knowledge-catalog.js';
import { loadKnowledgeBody, storeKnowledgeBody } from './knowledge-body-store.js';
import { storedNoteHistory, readKnowledgeVersion } from './knowledge-version-blobs.js';
import { knowledgeSnapshotHash } from './knowledge-versions.js';
import { historyContent } from '../shared/knowledge-history.js';
import { validateDocumentInput } from '../shared/workspace-schema.js';
import { bindWikiReferences, extractWikiLinks } from '../shared/knowledge-links.js';

const fields = [
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
  'sourceFormat',
  'sourceName',
];
const fail = (code, statusCode = 400) => Object.assign(new Error('The note body changed or was not loaded. Refresh the note and retry.'), { code, statusCode });

// A metadata-only record is an explicit protocol message, never an empty body.
// The canonical revision and body token are both checked inside the write lock.
export async function replaceKnowledgeCatalog(input, expectedRevision, profile, profiles = []) {
  if (process.env.KNOWLEDGE_CATALOG_ENABLED !== 'true') throw fail('KNOWLEDGE_CATALOG_DISABLED', 409);
  validateDocumentInput('knowledge', input);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw fail('INVALID_NOTE_PATCH');
  for (let attempt = 0; attempt < 3; attempt++) {
    const baseline = await getWorkspaceDatabase({ fields: ['revision'] });
    try {
      const saved = await mutateWorkspaceMetadata(
        async data => {
          const actor = knowledgeActor(data, profile, profiles, { write: true });
          const meta = data._documentRevisions?.knowledge || {};
          if (Number(meta.revision || 0) !== expectedRevision)
            throw Object.assign(fail('REVISION_CONFLICT', 409), { currentRevision: Number(meta.revision || 0), documentConflict: true });
          const previous = new Map((data.knowledgeNotes || []).map(note => [note.id, note]));
          const storage = getStorageProvider(),
            notes = [];
          for (const incoming of input.knowledgeNotes) {
            if (Object.hasOwn(incoming, 'bodyRef')) throw fail('INVALID_NOTE_PATCH');
            const before = previous.get(incoming.id);
            const hasBody = Object.hasOwn(incoming, 'formatted_markdown');
            if (before && incoming.bodyToken !== knowledgeBodyToken(before)) throw fail('KNOWLEDGE_BODY_STALE', 409);
            if (!before && (!hasBody || incoming.bodyPending)) throw fail('KNOWLEDGE_BODY_REQUIRED');
            const patch = Object.fromEntries(fields.filter(field => Object.hasOwn(incoming, field)).map(field => [field, structuredClone(incoming[field])]));
            const candidate = { ...before, id: incoming.id, ...patch };
            if (before && !hasBody && !incoming.restoreFromVersion && isDeepStrictEqual(candidate, before)) {
              notes.push(before);
              continue;
            }
            const loaded = before && (await loadKnowledgeBody(storage, before));
            const next = { ...loaded, id: incoming.id, ...patch };
            if (!hasBody && loaded) next.formatted_markdown = loaded.formatted_markdown;
            if (incoming.restoreFromVersion) {
              if (!loaded || knowledgeSnapshotHash(loaded) !== incoming.restoreExpectedHash) throw fail('KNOWLEDGE_VERSION_STALE', 409);
              const version = before.history?.find(item => item.id === incoming.restoreFromVersion);
              if (!version) throw fail('KNOWLEDGE_VERSION_NOT_FOUND', 404);
              Object.assign(next, historyContent(await readKnowledgeVersion(storage, next.id, version), input.knowledgeFolders));
              next.restoreFromVersion = version.id;
            }
            validateDocumentInput('knowledge', { knowledgeNotes: [next], knowledgeFolders: input.knowledgeFolders });
            if (loaded && isDeepStrictEqual(next, loaded)) {
              notes.push(before);
              continue;
            }
            next.createdBy = loaded?.createdBy || actor.id;
            next.createdAt = loaded?.createdAt || new Date().toISOString();
            next.updatedBy = actor.id;
            next.updatedAt = new Date().toISOString();
            next.wikilinks = extractWikiLinks(next.formatted_markdown);
            next.history = await storedNoteHistory(storage, loaded, next);
            delete next.restoreFromVersion;
            notes.push(await storeKnowledgeBody(storage, next));
          }
          bindWikiReferences(notes);
          if (isDeepStrictEqual(notes, data.knowledgeNotes) && isDeepStrictEqual(input.knowledgeFolders, data.knowledgeFolders))
            throw Object.assign(new Error('Catalog unchanged'), { code: 'KNOWLEDGE_CATALOG_UNCHANGED', result: knowledgeCatalogDocument(data) });
          data.knowledgeNotes = notes;
          data.knowledgeFolders = structuredClone(input.knowledgeFolders);
          data._documentRevisions = {
            ...data._documentRevisions,
            knowledge: { revision: expectedRevision + 1, createdAt: meta.createdAt || data.createdAt, updatedAt: new Date().toISOString() },
          };
          return data;
        },
        baseline.revision,
        { role: 'admin', scope: 'knowledge' },
      );
      return knowledgeCatalogDocument(saved);
    } catch (error) {
      if (error.code === 'KNOWLEDGE_CATALOG_UNCHANGED') return error.result;
      if (error.code !== 'REVISION_CONFLICT' || error.documentConflict || attempt === 2) throw error;
    }
  }
}
