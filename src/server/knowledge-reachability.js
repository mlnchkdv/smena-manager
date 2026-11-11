import { createHash } from 'node:crypto';
import { backupObjectReferences, BACKUP_OBJECT_MAX_BYTES } from './prepared-workspace-backup.js';
import { materializeKnowledgeMetadata, knowledgeMetadataFields } from './storage/knowledge-metadata-shards.js';
import { knowledgeSearchParts } from './knowledge-search-store.js';
import { isDeepStrictEqual } from 'node:util';

const digest = text => createHash('sha256').update(text).digest('hex');
const error = (code = 'KNOWLEDGE_MAINTENANCE_INTEGRITY') => Object.assign(new Error('Knowledge object inspection is incomplete.'), { code, statusCode: 503 });
const modes = ['canonical', 'independent', 'preparation'];
const liveKinds = new Set(['metadata', 'body', 'version', 'search']);
const key = object => (object.area === 'backup' ? `backup:${object.sha256}` : `live:${object.kind}:${object.sha256}`);
const descriptor = value => {
  if (!value || !/^[a-f0-9]{64}$/.test(value.sha256 || '') || !Number.isSafeInteger(value.bytes) || value.bytes < 1 || value.bytes > BACKUP_OBJECT_MAX_BYTES)
    throw error();
  return value;
};
function retain(state, object, required) {
  descriptor(object);
  const id = key(object),
    existing = state.reachable[id];
  if (existing && (existing.bytes !== object.bytes || existing.kind !== object.kind || !isDeepStrictEqual(existing.expected, object.expected))) throw error();
  if (!existing) state.retainedCount++;
  state.reachable[id] = { ...object, required: required || !!existing?.required };
  if (state.retainedCount > 100000) throw error('KNOWLEDGE_MAINTENANCE_LIMIT');
}
function enqueue(state, object, mode) {
  if (!modes.includes(mode)) throw error();
  if (mode !== 'independent' && liveKinds.has(object.kind)) retain(state, { ...object, area: 'live' }, true);
  if (mode !== 'canonical') retain(state, { ...object, area: 'backup' }, mode === 'independent' || object.kind === 'root');
  if (!['root', 'metadata'].includes(object.kind)) return;
  const taskKey = `${mode}:${object.kind}:${object.sha256}`;
  if (!state.visited.includes(taskKey) && !state.pending.some(task => task.key === taskKey)) state.pending.push({ key: taskKey, mode, object });
}
function imports(state, jobs) {
  for (const job of jobs || []) {
    const preparation = job?.backupPreparation;
    if (!preparation) continue;
    if (preparation.format !== 'smena-backup-preparation-v1' || preparation.source?.kind !== 'root') throw error('KNOWLEDGE_MAINTENANCE_FORMAT_UNSUPPORTED');
    enqueue(state, descriptor(preparation.source), 'preparation');
  }
}
async function rootReferences(state, root, mode) {
  if (!root || ![3, 4].includes(root.schemaVersion)) throw error('KNOWLEDGE_MAINTENANCE_FORMAT_UNSUPPORTED');
  const known = new Set([
    '_knowledgeCatalog',
    '_knowledgeSearch',
    '_knowledgeImports',
    '_knowledgeImportRevision',
    '_knowledgeMetadataPending',
    '_knowledgeMigration',
    '_knowledgeStorageVersion',
  ]);
  if (Object.keys(root).some(field => field.startsWith('_knowledge') && !known.has(field))) throw error('KNOWLEDGE_MAINTENANCE_FORMAT_UNSUPPORTED');
  if (root._knowledgeStorageVersion != null && root._knowledgeStorageVersion !== 1) throw error('KNOWLEDGE_MAINTENANCE_FORMAT_UNSUPPORTED');
  if (root._knowledgeMigration) {
    const fields = new Set(['id', 'state', 'processed', 'startedAt', 'by', 'backupId', 'updatedAt', 'completedAt']);
    if (!['running', 'paused', 'complete'].includes(root._knowledgeMigration.state) || Object.keys(root._knowledgeMigration).some(field => !fields.has(field)))
      throw error('KNOWLEDGE_MAINTENANCE_FORMAT_UNSUPPORTED');
  }
  await materializeKnowledgeMetadata(root, {}, { knowledge: false }); // pointer validation only; no child reads
  if (root._knowledgeSearch) knowledgeSearchParts(root);
  for (const object of backupObjectReferences(root)) if (object.kind !== 'metadata') enqueue(state, object, mode);
  for (const [field, parts] of Object.entries(root._knowledgeCatalog?.fields || {})) {
    const groups = new Map(parts.map(part => [part.prefix, []]));
    const identities = field === '_knowledgeSearch' ? (parts.length ? ['search'] : []) : root[field].map(row => row.id);
    for (const id of identities) {
      const hashed = digest(id);
      let group;
      for (let length = 1; length <= 6; length++) {
        group = groups.get(hashed.slice(0, length));
        if (group) break;
      }
      if (!group) throw error();
      group.push(id);
    }
    for (const part of parts) {
      const ids = groups.get(part.prefix).sort();
      if (ids.length !== part.count) throw error();
      enqueue(state, { kind: 'metadata', sha256: part.sha256, bytes: part.bytes, expected: { field, prefix: part.prefix, ids } }, mode);
    }
  }
  imports(state, root._knowledgeImports);
}

// Server-owned inspection cursor. This module has no write/delete provider API.
// A controller must authorize the canonical workspace before supplying roots.
export async function beginKnowledgeReachability({ root, backups = [], backupsComplete = false }) {
  if (!root || Buffer.byteLength(JSON.stringify(root)) > 4 * 1024 * 1024 || !Array.isArray(backups) || backups.length > 2000)
    throw error('KNOWLEDGE_MAINTENANCE_LIMIT');
  const state = {
    format: 'smena-knowledge-reachability-v1',
    rootFingerprint: digest(JSON.stringify(root)),
    reachable: {},
    pending: [],
    visited: [],
    inspected: 0,
    retainedCount: 0,
    rootsComplete: backupsComplete === true,
  };
  await rootReferences(state, root, 'canonical');
  for (const backup of backups) await backupReferences(state, backup);
  return state;
}

async function backupReferences(state, backup) {
  if (backup?.format === 'smena-prepared-backup-v1') {
    if (backup.source?.kind !== 'root') throw error();
    enqueue(state, descriptor(backup.source), 'independent');
  } else if (backup && !Object.hasOwn(backup, 'format') && backup.data && !Object.hasOwn(backup, 'version')) {
    // Legacy monolithic snapshots may retain external pointers even when
    // their current bodies were expanded. Keep those references conservatively.
    await rootReferences(state, backup.data, 'canonical');
  } else throw error('KNOWLEDGE_MAINTENANCE_FORMAT_UNSUPPORTED');
}

// Add a single verified snapshot while a durable controller pages through the
// backup inventory. The caller must not mark rootsComplete until enumeration ends.
export async function appendKnowledgeBackup(previous, backup) {
  if (previous?.format !== 'smena-knowledge-reachability-v1') throw error();
  const state = structuredClone(previous);
  await backupReferences(state, backup);
  return state;
}

export async function stepKnowledgeReachability(previous, readObject) {
  if (
    previous?.format !== 'smena-knowledge-reachability-v1' ||
    !Array.isArray(previous.pending) ||
    !Array.isArray(previous.visited) ||
    typeof readObject !== 'function'
  )
    throw error();
  const state = structuredClone(previous),
    task = state.pending.pop();
  if (!task) return state;
  const object = descriptor(task.object);
  if (!['root', 'metadata'].includes(object.kind) || !modes.includes(task.mode)) throw error();
  let text;
  if (task.mode === 'canonical') text = await readObject({ ...object, area: 'live' });
  else {
    try {
      text = await readObject({ ...object, area: 'backup' });
    } catch (failure) {
      if (task.mode !== 'preparation' || object.kind === 'root' || failure.code !== 'ENOENT') throw failure;
      text = await readObject({ ...object, area: 'live' });
    }
  }
  if (typeof text !== 'string' || Buffer.byteLength(text) !== object.bytes || digest(text) !== object.sha256) throw error();
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw error();
  }
  if (object.kind === 'root') await rootReferences(state, value, task.mode);
  else {
    const expected = object.expected;
    if (
      value?.format !== 'smena-knowledge-metadata-v1' ||
      !expected ||
      value.field !== expected.field ||
      value.prefix !== expected.prefix ||
      !knowledgeMetadataFields.includes(value.field) ||
      !Array.isArray(value.rows) ||
      value.rows.some(
        row =>
          !Array.isArray(row) ||
          row.length !== 2 ||
          typeof row[0] !== 'string' ||
          !row[1] ||
          typeof row[1] !== 'object' ||
          Array.isArray(row[1]) ||
          (value.field !== '_knowledgeSearch' && row[1].id !== row[0]),
      ) ||
      !isDeepStrictEqual(value.rows.map(row => row[0]).sort(), expected.ids)
    )
      throw error();
    if (value.field === '_knowledgeSearch') {
      const search = Object.fromEntries(value.rows).search;
      if (!search) throw error();
      knowledgeSearchParts({ _knowledgeSearch: search });
    }
    for (const child of backupObjectReferences(value, 'metadata')) enqueue(state, child, task.mode);
    if (value.field === '_knowledgeImports')
      imports(
        state,
        value.rows.map(row => row[1]),
      );
  }
  state.visited.push(task.key);
  state.inspected++;
  return state;
}

// Inventory and prior observations are trusted controller inputs, never client
// claims. First observation starts retention; old creation time alone is not enough.
export function previewKnowledgeMaintenance(
  state,
  inventory,
  { inventoryComplete = false, currentRootFingerprint = '', now = Date.now(), retentionDays = 30, observations = {} } = {},
) {
  if (
    state?.format !== 'smena-knowledge-reachability-v1' ||
    !Array.isArray(inventory) ||
    inventory.length > 1000000 ||
    !Number.isFinite(now) ||
    !Number.isInteger(retentionDays) ||
    retentionDays < 30
  )
    throw error();
  const seen = new Set(),
    inventoryIds = new Set(),
    counts = { reachable: 0, unreferenced: 0, unclassified: 0, retained: 0, unknown: 0, candidates: 0, candidateBytes: 0 },
    candidates = [],
    observed = [];
  const minimumAge = retentionDays * 86400000;
  const rootCurrent = currentRootFingerprint === state.rootFingerprint;
  for (const object of inventory) {
    if (
      !object ||
      !['live', 'backup'].includes(object.area) ||
      (object.area === 'live' && !liveKinds.has(object.kind)) ||
      object.owned !== true ||
      !/^[a-f0-9]{64}$/.test(object.sha256 || '') ||
      !Number.isSafeInteger(object.bytes) ||
      object.bytes < 1 ||
      object.bytes > BACKUP_OBJECT_MAX_BYTES ||
      typeof object.id !== 'string' ||
      !object.id ||
      object.id.length > 256
    ) {
      counts.unknown++;
      continue;
    }
    const observationKey = `${object.area}:${object.id}`;
    if (inventoryIds.has(observationKey)) throw error();
    inventoryIds.add(observationKey);
    const target = state.reachable[key(object)];
    if (target) {
      if (target.bytes !== object.bytes) throw error();
      if (object.area === 'live' && seen.has(key(object))) counts.unknown++;
      counts.reachable++;
      seen.add(key(object));
      continue;
    }
    if (object.recognizedFormat !== true) {
      counts.unknown++;
      continue;
    }
    if (state.pending.length || !state.rootsComplete || !rootCurrent) {
      counts.unclassified++;
      continue;
    }
    counts.unreferenced++;
    const observedAt = Number(observations[observationKey]);
    observed.push({ key: observationKey, firstUnreferencedAt: Number.isFinite(observedAt) && observedAt > 0 && observedAt <= now ? observedAt : now });
    const created = Date.parse(object.createdAt);
    if (
      !Number.isFinite(created) ||
      created > now ||
      now - created < minimumAge ||
      !Number.isFinite(observedAt) ||
      observedAt <= 0 ||
      observedAt > now ||
      now - observedAt < minimumAge ||
      object.integrityChecked !== true
    ) {
      counts.retained++;
      continue;
    }
    counts.candidates++;
    counts.candidateBytes += object.bytes;
    if (candidates.length < 200) candidates.push({ ...object });
  }
  const missing = Object.entries(state.reachable).filter(([id, object]) => object.required && !seen.has(id)).length;
  const complete = rootCurrent && state.rootsComplete && inventoryComplete && !state.pending.length && !missing && !counts.unknown;
  return {
    format: 'smena-knowledge-maintenance-preview-v1',
    asOf: new Date(now).toISOString(),
    rootFingerprint: state.rootFingerprint,
    complete,
    rootCurrent,
    rootsComplete: state.rootsComplete,
    inventoryComplete,
    pending: state.pending.length,
    missing,
    retentionDays,
    counts,
    candidates: complete ? candidates : [],
    observations: complete ? observed : [],
    deletionEnabled: false,
  };
}

export function publicKnowledgeMaintenancePreview(preview) {
  const fields = ['reachable', 'unreferenced', 'unclassified', 'retained', 'unknown', 'candidates', 'candidateBytes'];
  if (
    preview?.format !== 'smena-knowledge-maintenance-preview-v1' ||
    fields.some(field => !Number.isSafeInteger(preview.counts?.[field]) || preview.counts[field] < 0)
  )
    throw error();
  return {
    asOf: preview.asOf,
    complete: preview.complete,
    rootCurrent: preview.rootCurrent,
    rootsComplete: preview.rootsComplete,
    inventoryComplete: preview.inventoryComplete,
    pending: preview.pending,
    missing: preview.missing,
    retentionDays: preview.retentionDays,
    counts: Object.fromEntries(fields.map(field => [field, preview.counts[field]])),
    deletionEnabled: false,
  };
}
