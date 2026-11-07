import fs from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { isDeepStrictEqual } from 'node:util';
import { materializeKnowledgeMetadata, stageKnowledgeImportJournal } from './knowledge-metadata-shards.js';
import { validateCatalogManifest } from './file-catalog-shards.js';
import { storageVersion } from './version-token.js';
import { renameWithRetry } from './windows-file-retry.js';

const digest = text => createHash('sha256').update(text).digest('hex');
const omitJournal = data => Object.fromEntries(Object.entries(data).filter(([key]) => key !== '_knowledgeImports'));
const conflict = revision =>
  Object.assign(new Error('Import progress changed. Retry.'), { code: 'REVISION_CONFLICT', statusCode: 409, currentRevision: revision });
async function journalProjection(root, storage, authorize) {
  if (!root || root._aggregateVersion !== 1 || ![3, 4].includes(root.schemaVersion)) return null;
  if (typeof authorize !== 'function') throw new TypeError('A canonical membership check is required.');
  await authorize(structuredClone(root));
  if (root._fileCatalog) validateCatalogManifest(root._fileCatalog);
  return materializeKnowledgeMetadata(root, storage, { fields: ['_knowledgeImports'] });
}
function changedRoot(snapshot, changed) {
  if (!isDeepStrictEqual(omitJournal(snapshot), omitJournal(changed)))
    throw Object.assign(new Error('Only the import journal may change.'), { code: 'METADATA_WRITE_FORBIDDEN', statusCode: 403 });
}
function nextPrivateRoot(root) {
  const revision = root._knowledgeImportRevision ?? 0;
  if (!Number.isSafeInteger(revision) || revision < 0 || revision === Number.MAX_SAFE_INTEGER)
    throw Object.assign(new Error('Import journal revision is invalid.'), { code: 'KNOWLEDGE_METADATA_INTEGRITY', statusCode: 503 });
  return { ...root, _knowledgeImportRevision: revision + 1 };
}

export function localKnowledgeImportJournals(storage) {
  const snapshots = new WeakMap();
  return {
    async loadKnowledgeImportJournal({ authorize } = {}) {
      let text;
      try {
        text = await fs.readFile(storage.databasePath, 'utf8');
      } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
      }
      const root = JSON.parse(text),
        data = await journalProjection(structuredClone(root), storage, authorize);
      if (data) snapshots.set(data, { root, hash: digest(text) });
      return data;
    },
    async saveKnowledgeImportJournal(changed, baseline) {
      const source = snapshots.get(baseline);
      if (!source) throw new TypeError('A journal write snapshot is required.');
      changedRoot(baseline, changed);
      const next = await stageKnowledgeImportJournal(nextPrivateRoot(source.root), changed._knowledgeImports, storage);
      if (digest(await fs.readFile(storage.databasePath, 'utf8')) !== source.hash) throw conflict(baseline.revision);
      const temporary = storage.databasePath + '.' + randomUUID() + '.tmp';
      try {
        await fs.writeFile(temporary, JSON.stringify(next, null, 2), 'utf8');
        await renameWithRetry(temporary, storage.databasePath);
      } finally {
        await fs.unlink(temporary).catch(() => undefined);
      }
      storage.knowledgeRoot = next;
      return { ...changed, _knowledgeImportRevision: next._knowledgeImportRevision };
    },
  };
}

export function driveKnowledgeImportJournals(storage) {
  const snapshots = new WeakMap();
  return {
    async loadKnowledgeImportJournal({ authorize } = {}) {
      const root = await storage.readDatabaseRoot({ knowledge: false });
      const fileId = storage.databaseFileId,
        version = storageVersion(root);
      const data = await journalProjection(structuredClone(root), storage, authorize);
      if (data) snapshots.set(data, { root: structuredClone(root), fileId, version });
      return data;
    },
    async saveKnowledgeImportJournal(changed, baseline) {
      const source = snapshots.get(baseline);
      if (!source?.fileId || !source.version)
        throw Object.assign(new Error('Storage version is missing.'), { code: 'STORAGE_VERSION_MISSING', statusCode: 503 });
      changedRoot(baseline, changed);
      const next = await stageKnowledgeImportJournal(nextPrivateRoot(source.root), changed._knowledgeImports, storage);
      await storage.client.files.update(
        { fileId: source.fileId, media: { mimeType: 'application/json', body: Readable.from([JSON.stringify(next)]) }, fields: 'id', supportsAllDrives: true },
        { headers: { 'If-Match': source.version }, signal: AbortSignal.timeout(30000) },
      );
      return { ...changed, _knowledgeImportRevision: next._knowledgeImportRevision };
    },
  };
}
