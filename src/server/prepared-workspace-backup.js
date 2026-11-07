import { createHash } from 'node:crypto';
import { materializeKnowledgeMetadata } from './storage/knowledge-metadata-shards.js';
import { materializeCatalog } from './storage/file-catalog-shards.js';
import { expandKnowledgeBodies } from './knowledge-body-store.js';
import { expandKnowledgeVersions } from './knowledge-version-blobs.js';

export const BACKUP_OBJECT_MAX_BYTES = 16 * 1024 * 1024;
const hash = text => createHash('sha256').update(text).digest('hex');
const invalid = () =>
  Object.assign(new Error('The recovery copy is incomplete or failed its integrity check.'), { code: 'BACKUP_PREPARATION_INTEGRITY', statusCode: 503 });
const ref = (kind, value) => {
  if (!value || !/^[a-f0-9]{64}$/.test(value.sha256 || '') || !Number.isSafeInteger(value.bytes) || value.bytes < 1 || value.bytes > BACKUP_OBJECT_MAX_BYTES)
    throw invalid();
  return { kind, sha256: value.sha256, bytes: value.bytes, ...(kind === 'files' ? { id: value.id } : {}) };
};
function noteReferences(note) {
  const refs = [];
  if (note?.bodyRef) {
    if (note.bodyRef.kind !== 'knowledge-body-v1') throw invalid();
    refs.push(ref('body', note.bodyRef));
  }
  for (const version of note?.history || [])
    if (version.contentRef) {
      if (version.contentRef.kind !== 'knowledge-version-v1') throw invalid();
      refs.push(ref('version', version.contentRef));
    }
  return refs;
}
function searchReferences(search) {
  return [...(search?.parts || []), ...(search?.directory ? [search.directory] : [])].map(value => ref('search', value));
}
export function backupObjectReferences(value, kind = 'root') {
  if (kind === 'root')
    return [
      ...Object.values(value._knowledgeCatalog?.fields || {}).flatMap(parts => parts.map(part => ref('metadata', part))),
      ...(value._fileCatalog?.shards || []).map(part => ref('files', part)),
      ...(value.knowledgeNotes || []).flatMap(noteReferences),
      ...(value.trash || []).filter(item => item.kind === 'note').flatMap(item => noteReferences(item.data?.note)),
      ...searchReferences(value._knowledgeSearch),
    ];
  if (kind === 'metadata') {
    if (value?.format !== 'smena-knowledge-metadata-v1' || !Array.isArray(value.rows)) throw invalid();
    if (value.field === 'knowledgeNotes') return value.rows.flatMap(row => noteReferences(row[1]));
    if (value.field === '_knowledgeSearch') return searchReferences(Object.fromEntries(value.rows).search);
  }
  return [];
}
function verify(text, descriptor) {
  if (typeof text !== 'string' || Buffer.byteLength(text) !== descriptor.bytes || hash(text) !== descriptor.sha256) throw invalid();
  return text;
}

// Freeze the immutable root before the import job is published. Nothing here
// expands note bodies, versions, metadata parts or the file catalog.
export async function beginPreparedBackup(storage, root, label = '') {
  if (!root || ![3, 4].includes(root.schemaVersion) || root._aggregateVersion !== 1 || Buffer.byteLength(JSON.stringify(root)) > 4 * 1024 * 1024)
    throw invalid();
  const snapshot = structuredClone(root);
  delete snapshot._knowledgeMetadataPending;
  if (snapshot._knowledgeCatalog) snapshot.schemaVersion = 4;
  const text = JSON.stringify(snapshot),
    source = { kind: 'root', sha256: hash(text), bytes: Buffer.byteLength(text) };
  const pending = backupObjectReferences(snapshot);
  const createdAt = new Date().toISOString();
  await storage.writeWorkspaceBackupObject(text, source.sha256);
  return {
    format: 'smena-backup-preparation-v1',
    source,
    pending,
    copied: 0,
    bytes: source.bytes,
    createdAt,
    label: String(label).slice(0, 120),
    state: 'preparing',
  };
}

export async function advancePreparedBackup(storage, previous) {
  if (previous?.format !== 'smena-backup-preparation-v1' || !Array.isArray(previous.pending) || previous.pending.length > 20000) throw invalid();
  ref('root', previous.source);
  if (
    !['preparing', 'complete'].includes(previous.state) ||
    !Number.isSafeInteger(previous.copied) ||
    previous.copied < 0 ||
    !Number.isSafeInteger(previous.bytes) ||
    previous.bytes < previous.source.bytes
  )
    throw invalid();
  if (previous.state === 'complete') return structuredClone(previous);
  const job = structuredClone(previous),
    next = job.pending.pop();
  if (next) {
    if (!['metadata', 'body', 'version', 'search', 'files'].includes(next.kind)) throw invalid();
    ref(next.kind, next);
    let text,
      independent = false;
    try {
      text = verify(await storage.readWorkspaceBackupObject(next.sha256), next);
      independent = true;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (!independent) {
      if (next.kind === 'metadata') text = await storage.readKnowledgeMetadata(next.sha256);
      else if (next.kind === 'body') text = await storage.readKnowledgeBody(next.sha256);
      else if (next.kind === 'version') text = await storage.readKnowledgeVersion(next.sha256);
      else if (next.kind === 'search') text = await storage.readKnowledgeSearch(next.sha256);
      else if (next.kind === 'files') text = await storage.readCatalogPart(next.id, next);
      else throw invalid();
    }
    verify(text, next);
    // Discover children only in known canonical envelopes, never in note text
    // or arbitrary custom properties containing similarly named keys.
    const children = ['root', 'metadata'].includes(next.kind) ? backupObjectReferences(JSON.parse(text), next.kind) : [];
    if (job.pending.length + children.length > 20000) throw invalid();
    if (!independent) await storage.writeWorkspaceBackupObject(text, next.sha256);
    job.pending.push(...children);
    job.copied++;
    job.bytes += next.bytes;
    // One immutable object per call, independent of the total note count.
    return job;
  }
  const manifest = { format: 'smena-prepared-backup-v1', source: job.source, createdAt: job.createdAt, label: job.label, bytes: job.bytes, copied: job.copied };
  job.backup = await storage.publishWorkspaceBackup(manifest);
  if (!job.backup?.id) throw invalid();
  job.state = 'complete';
  return job;
}

export async function restorePreparedBackup(storage, manifest) {
  if (manifest?.format !== 'smena-prepared-backup-v1') throw invalid();
  const source = ref('root', manifest.source);
  const read = async descriptor => verify(await storage.readWorkspaceBackupObject(descriptor.sha256), descriptor);
  let root = JSON.parse(await read(source));
  const descriptors = new Map(backupObjectReferences(root).map(value => [value.sha256, value]));
  const readKnown = async (kind, sha256) => {
    const descriptor = descriptors.get(sha256);
    if (!descriptor || descriptor.kind !== kind) throw invalid();
    const text = await read(descriptor);
    if (kind === 'metadata') for (const child of backupObjectReferences(JSON.parse(text), kind)) descriptors.set(child.sha256, child);
    return text;
  };
  const backupStorage = {
    readKnowledgeMetadata: sha => readKnown('metadata', sha),
    readKnowledgeBody: sha => readKnown('body', sha),
    readKnowledgeVersion: sha => readKnown('version', sha),
  };
  root = await materializeKnowledgeMetadata(root, backupStorage);
  root = await materializeCatalog(root, (_id, part) => readKnown('files', part.sha256));
  root = await expandKnowledgeBodies(root, backupStorage);
  root = await expandKnowledgeVersions(root, backupStorage);
  // Search is derived. Restoring current content rebuilds it; no source object
  // in the live body/version namespaces is needed by this independent copy.
  delete root._knowledgeSearch;
  delete root._knowledgeCatalog;
  delete root._knowledgeMetadataPending;
  return root;
}
