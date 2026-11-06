import { randomUUID } from 'node:crypto';
import { getWorkspaceDatabase, mutateWorkspaceMetadata } from './workspace-store.js';
import { getStorageProvider } from './storage/index.js';
import { knowledgeActor } from './knowledge-access.js';
import { loadKnowledgeBody, storeKnowledgeBody } from './knowledge-body-store.js';
import { externalizeKnowledgeVersions } from './knowledge-version-blobs.js';
const error = (code, statusCode = 400) => Object.assign(new Error('The selected notes changed or are unavailable. Refresh and retry.'), { code, statusCode });

export async function updateKnowledgeTrash(operation, input, expectedRevision, profile, profiles = []) {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || !['trash', 'restore'].includes(operation)) throw error('INVALID_NOTE_PATCH');
  if (
    operation === 'trash' &&
    (!Array.isArray(input) || !input.length || input.length > 100 || input.some(id => typeof id !== 'string') || new Set(input).size !== input.length)
  )
    throw error('INVALID_NOTE_PATCH');
  if (operation === 'restore' && typeof input !== 'string') throw error('INVALID_NOTE_PATCH');
  for (let attempt = 0; attempt < 3; attempt++) {
    const base = await getWorkspaceDatabase({ fields: ['revision'] });
    try {
      const saved = await mutateWorkspaceMetadata(
        async data => {
          const actor = knowledgeActor(data, profile, profiles, { write: true }),
            meta = data._documentRevisions?.knowledge || {};
          if (Number(meta.revision || 0) !== expectedRevision)
            throw Object.assign(error('REVISION_CONFLICT', 409), { documentConflict: true, currentRevision: Number(meta.revision || 0) });
          const storage = getStorageProvider();
          data.trash ||= [];
          if (operation === 'trash') {
            const selected = input.map(id => data.knowledgeNotes.find(note => note.id === id));
            if (selected.some(note => !note)) throw error('KNOWLEDGE_NOT_FOUND', 404);
            for (const note of selected) {
              const migrated = await externalizeKnowledgeVersions({ knowledgeNotes: [note] }, storage);
              const stored = note.bodyRef ? migrated.knowledgeNotes[0] : await storeKnowledgeBody(storage, migrated.knowledgeNotes[0]);
              data.trash.unshift({
                id: 'trash-' + randomUUID(),
                kind: 'note',
                name: note.title,
                deletedAt: Date.now(),
                deletedBy: actor.id,
                data: { note: stored },
              });
            }
            const ids = new Set(input);
            data.knowledgeNotes = data.knowledgeNotes.filter(note => !ids.has(note.id));
          } else {
            const item = data.trash.find(item => item.id === input && item.kind === 'note');
            if (!item || (profile.role !== 'admin' && item.deletedBy !== actor.id)) throw error('KNOWLEDGE_NOT_FOUND', 404);
            if (data.knowledgeNotes.some(note => note.id === item.data?.note?.id)) throw error('KNOWLEDGE_RESTORE_EXISTS', 409);
            const restored = await loadKnowledgeBody(storage, item.data.note);
            if (!data.knowledgeFolders.some(folder => folder.id === restored.folderId)) restored.folderId = null;
            const migrated = await externalizeKnowledgeVersions({ knowledgeNotes: [restored] }, storage);
            data.knowledgeNotes.push(await storeKnowledgeBody(storage, migrated.knowledgeNotes[0]));
            data.trash = data.trash.filter(entry => entry.id !== item.id);
          }
          data._documentRevisions = {
            ...data._documentRevisions,
            knowledge: { revision: expectedRevision + 1, createdAt: meta.createdAt || data.createdAt, updatedAt: new Date().toISOString() },
          };
          return data;
        },
        base.revision,
        { role: 'admin', scope: 'knowledgeTrash' },
      );
      return { revision: saved.revision, documentRevision: saved._documentRevisions.knowledge.revision };
    } catch (failure) {
      if (failure.code !== 'REVISION_CONFLICT' || failure.documentConflict || attempt === 2) throw failure;
    }
  }
}
