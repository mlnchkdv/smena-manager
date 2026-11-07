import { createHash, randomUUID } from 'node:crypto';
import { getWorkspaceDatabase, mutateWorkspaceMetadata, mutateKnowledgeImportJournal, createWorkspaceBackup } from './workspace-store.js';
import { getStorageProvider } from './storage/index.js';
import { knowledgeActor } from './knowledge-access.js';
import { storeKnowledgeBody } from './knowledge-body-store.js';
import { parseMarkdownNote, parseTextNote } from '../shared/markdown-import.js';
import { bindWikiReferences } from '../shared/knowledge-links.js';
import { validateDocumentInput } from '../shared/workspace-schema.js';
import { beginPreparedBackup, advancePreparedBackup } from './prepared-workspace-backup.js';

const fail = (code, statusCode = 400) =>
  Object.assign(new Error('The note import could not continue. Review the files and destination.'), { code, statusCode });
const digest = value => createHash('sha256').update(value).digest('hex');
const enabled = () => {
  if (process.env.KNOWLEDGE_CATALOG_ENABLED !== 'true') throw fail('KNOWLEDGE_CATALOG_DISABLED', 409);
};
const owned = (data, id, actor) => {
  const job = data._knowledgeImports?.find(job => job.id === id && job.by === actor.id);
  if (!job) throw fail('KNOWLEDGE_IMPORT_NOT_FOUND', 404);
  return job;
};
function destination(data, folderId) {
  if (folderId && !data.knowledgeFolders?.some(folder => folder.id === folderId)) throw fail('KNOWLEDGE_IMPORT_FOLDER_CHANGED', 409);
}
async function mutate(profile, profiles, operation, journalOnly = false) {
  enabled();
  for (let attempt = 0; attempt < 3; attempt++) {
    const base = await getWorkspaceDatabase({ fields: ['revision'] });
    try {
      let result;
      const persist = journalOnly ? mutateKnowledgeImportJournal : mutateWorkspaceMetadata;
      await persist(
        async data => {
          const actor = knowledgeActor(data, profile, profiles, { write: true });
          result = await operation(data, actor);
          return data;
        },
        base.revision,
        { role: 'admin', scope: 'knowledgeImport', authorize: root => knowledgeActor(root, profile, profiles, { write: true }) },
      );
      return structuredClone(result);
    } catch (error) {
      if (error.code === 'KNOWLEDGE_IMPORT_UNCHANGED') return error.result;
      if (error.code !== 'REVISION_CONFLICT' || attempt === 2) throw error;
    }
  }
}
const unchanged = result => {
  throw Object.assign(new Error('Import unchanged.'), { code: 'KNOWLEDGE_IMPORT_UNCHANGED', result });
};
export function publicKnowledgeImport(job) {
  const { backupPreparation, ...publicJob } = job;
  if (backupPreparation)
    publicJob.backupProgress = { copied: backupPreparation.copied, bytes: backupPreparation.bytes, remaining: backupPreparation.pending.length };
  return publicJob;
}
export async function readKnowledgeImports(profile, profiles = []) {
  const data = await getWorkspaceDatabase({ fields: ['members', '_knowledgeImports'] });
  const actor = knowledgeActor(data, profile, profiles, { write: true });
  return (data._knowledgeImports || []).filter(job => job.by === actor.id).map(publicKnowledgeImport);
}
export async function startKnowledgeImport(input, profile, profiles = []) {
  enabled();
  const { clientId, entries, folderId = null, policy = 'copy' } = input || {};
  if (
    !/^[a-f0-9-]{36}$/.test(clientId || '') ||
    !['copy', 'skip'].includes(policy) ||
    (folderId !== null && typeof folderId !== 'string') ||
    !Array.isArray(entries) ||
    !entries.length ||
    entries.length > 1000 ||
    entries.some(
      entry =>
        !entry ||
        !/^[a-f0-9]{64}$/.test(entry.key || '') ||
        !/^[a-f0-9]{64}$/.test(entry.sourceHash || '') ||
        typeof entry.name !== 'string' ||
        entry.name.length > 512 ||
        /[\\/]/.test(entry.name) ||
        [...entry.name].some(char => char.charCodeAt(0) < 32) ||
        !/\.(txt|md|markdown)$/i.test(entry.name) ||
        !Number.isSafeInteger(entry.size) ||
        entry.size < 1 ||
        entry.size > 2 * 1024 * 1024,
    ) ||
    new Set(entries.map(entry => entry.key)).size !== entries.length ||
    entries.reduce((sum, entry) => sum + entry.size, 0) > 256 * 1024 * 1024
  )
    throw fail('KNOWLEDGE_IMPORT_INVALID');
  const manifest = { folderId, policy, entries: entries.map(({ key, name, size, sourceHash }) => ({ key, name, size, sourceHash })) };
  const manifestHash = digest(JSON.stringify(manifest));
  const current = await getWorkspaceDatabase({ fields: ['members', 'knowledgeFolders', '_knowledgeImports'] });
  const actor = knowledgeActor(current, profile, profiles, { write: true });
  destination(current, folderId);
  const previous = current._knowledgeImports?.find(job => job.id === clientId && job.by === actor.id);
  if (previous) {
    if (previous.manifestHash !== manifestHash) throw fail('KNOWLEDGE_IMPORT_STALE', 409);
    return publicKnowledgeImport(previous);
  }
  if (current._knowledgeImports?.filter(job => job.by === actor.id && ['preparing', 'running', 'paused'].includes(job.state)).length >= 3)
    throw fail('KNOWLEDGE_IMPORT_LIMIT', 409);
  // New clients prepare immutable recovery objects in resumable steps. Legacy
  // aggregate roots retain the existing backup path until their migration.
  const storage = getStorageProvider();
  const root = input.preparedBackup === true && storage.readDatabaseRoot ? await storage.readDatabaseRoot({ knowledge: false }) : null;
  if (root) knowledgeActor(root, profile, profiles, { write: true });
  const preparation = root?._aggregateVersion === 1 ? await beginPreparedBackup(storage, root, 'Before resumable note import') : null;
  const backup = preparation ? null : await createWorkspaceBackup('Before resumable note import');
  if (!preparation && !backup?.id) throw fail('KNOWLEDGE_IMPORT_BACKUP_FAILED', 503);
  return publicKnowledgeImport(
    await mutate(
      profile,
      profiles,
      (data, member) => {
        destination(data, folderId);
        data._knowledgeImports ||= [];
        const existing = data._knowledgeImports.find(job => job.id === clientId);
        if (existing) {
          if (existing.by !== member.id || existing.manifestHash !== manifestHash) throw fail('KNOWLEDGE_IMPORT_STALE', 409);
          return unchanged(existing);
        }
        if (data._knowledgeImports.filter(job => job.by === member.id && ['preparing', 'running', 'paused'].includes(job.state)).length >= 3)
          throw fail('KNOWLEDGE_IMPORT_LIMIT', 409);
        const job = {
          id: clientId,
          by: member.id,
          ...manifest,
          manifestHash,
          state: preparation ? 'preparing' : 'running',
          backupId: backup?.id || null,
          ...(preparation ? { backupPreparation: preparation } : {}),
          createdAt: new Date().toISOString(),
        };
        data._knowledgeImports = data._knowledgeImports
          .filter(job => job.by !== member.id || ['preparing', 'running', 'paused'].includes(job.state))
          .concat(data._knowledgeImports.filter(job => job.by === member.id && !['preparing', 'running', 'paused'].includes(job.state)).slice(-2), job);
        return job;
      },
      true,
    ),
  );
}
export async function prepareKnowledgeImport(id, profile, profiles = []) {
  return publicKnowledgeImport(
    await mutate(
      profile,
      profiles,
      async (data, actor) => {
        const job = owned(data, id, actor);
        if (!job.backupPreparation || job.state !== 'preparing') return unchanged(job);
        let next = job.backupPreparation;
        const started = Date.now(),
          initialBytes = next.bytes;
        for (let count = 0; count < 4 && next.state !== 'complete'; count++) {
          const bytes = next.pending.at(-1)?.bytes || 0;
          if (count && (Date.now() - started >= 2000 || next.bytes - initialBytes + bytes > 4 * 1024 * 1024)) break;
          next = await advancePreparedBackup(getStorageProvider(), next);
        }
        if (next.state === 'complete') {
          job.backupId = next.backup.id;
          delete job.backupPreparation;
          job.state = 'running';
        } else job.backupPreparation = next;
        job.updatedAt = new Date().toISOString();
        return job;
      },
      true,
    ),
  );
}
export async function controlKnowledgeImport(id, state, profile, profiles = []) {
  if (!['paused', 'running', 'canceled'].includes(state)) throw fail('KNOWLEDGE_IMPORT_INVALID');
  return publicKnowledgeImport(
    await mutate(
      profile,
      profiles,
      (data, actor) => {
        const job = owned(data, id, actor);
        if (['complete', 'canceled'].includes(job.state) || job.state === state) return unchanged(job);
        job.state = state === 'running' && job.backupPreparation ? 'preparing' : state;
        if (state === 'canceled') delete job.backupPreparation;
        job.updatedAt = new Date().toISOString();
        return job;
      },
      true,
    ),
  );
}
export async function appendKnowledgeImport(id, key, source, profile, profiles = []) {
  if (typeof source !== 'string' || !source.trim() || Buffer.byteLength(source) > 4 * 1024 * 1024) throw fail('KNOWLEDGE_IMPORT_INVALID');
  return publicKnowledgeImport(
    await mutate(profile, profiles, async (data, actor) => {
      const job = owned(data, id, actor),
        entry = job.entries.find(entry => entry.key === key);
      if (!entry || digest(source) !== entry.sourceHash) throw fail('KNOWLEDGE_IMPORT_SOURCE_CHANGED', 409);
      // A receipt is committed with the note/root. Lost responses can be retried
      // after a restart without creating another copy, even if it was later moved.
      if (entry.status) return unchanged(job);
      if (job.backupPreparation || !job.backupId) throw fail('KNOWLEDGE_IMPORT_BACKUP_PENDING', 409);
      if (job.state !== 'running') throw fail('KNOWLEDGE_IMPORT_PAUSED', 409);
      destination(data, job.folderId);
      const note = (/\.txt$/i.test(entry.name) ? parseTextNote : parseMarkdownNote)(entry.name, source, {
        idFactory: () => 'kn' + randomUUID(),
        folderId: job.folderId,
        memberId: actor.id,
      });
      const duplicate = data.knowledgeNotes?.some(
        existing => existing.title.toLocaleLowerCase() === note.title.toLocaleLowerCase() && (existing.folderId || null) === job.folderId,
      );
      if (duplicate && job.policy === 'skip') entry.status = 'skipped';
      else {
        validateDocumentInput('knowledge', { knowledgeNotes: [note], knowledgeFolders: data.knowledgeFolders || [] });
        const context = [note, ...(data.knowledgeNotes || []).map(existing => ({ ...existing }))];
        bindWikiReferences(context);
        data.knowledgeNotes = [...(data.knowledgeNotes || []), await storeKnowledgeBody(getStorageProvider(), note)];
        entry.status = 'imported';
        entry.noteId = note.id;
        const meta = data._documentRevisions?.knowledge || {};
        data._documentRevisions = {
          ...data._documentRevisions,
          knowledge: { revision: Number(meta.revision || 0) + 1, createdAt: meta.createdAt || data.createdAt, updatedAt: note.updatedAt },
        };
      }
      job.updatedAt = new Date().toISOString();
      if (job.entries.every(entry => entry.status)) job.state = 'complete';
      return job;
    }),
  );
}
