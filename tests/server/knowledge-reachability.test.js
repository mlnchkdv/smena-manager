import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { stageKnowledgeMetadata } from '../../src/server/storage/knowledge-metadata-shards.js';
import {
  beginKnowledgeReachability,
  stepKnowledgeReachability,
  previewKnowledgeMaintenance,
  publicKnowledgeMaintenancePreview,
} from '../../src/server/knowledge-reachability.js';

const hash = text => createHash('sha256').update(text).digest('hex');
let previousGates;
const gates = ['KNOWLEDGE_CATALOG_ENABLED', 'KNOWLEDGE_METADATA_SHARDS_ENABLED'];
test.beforeEach(() => {
  previousGates = gates.map(key => process.env[key]);
  for (const key of gates) process.env[key] = 'true';
});
test.afterEach(() =>
  gates.forEach((key, index) => {
    if (previousGates[index] === undefined) delete process.env[key];
    else process.env[key] = previousGates[index];
  }),
);
async function fixture() {
  const objects = new Map(),
    reads = [];
  const put = (area, kind, value) => {
    const text = JSON.stringify(value),
      sha256 = hash(text),
      bytes = Buffer.byteLength(text);
    objects.set(`${area}:${sha256}`, { area, kind, sha256, bytes, text });
    return { kind, sha256, bytes };
  };
  const body = (id, area = 'live') => {
    const reference = put(area, 'body', { format: 'smena-knowledge-body-v1', noteId: id, formatted_markdown: 'PRIVATE source ' + id });
    return { id, title: id, bodyRef: { ...reference, kind: 'knowledge-body-v1' } };
  };
  const root = note => ({ schemaVersion: 3, _aggregateVersion: 1, revision: 1, knowledgeNotes: [note], knowledgeFolders: [] });
  const stage = async (data, area = 'live') =>
    stageKnowledgeMetadata(data, {
      async writeKnowledgeMetadata(text, sha256) {
        assert.equal(hash(text), sha256);
        put(area, 'metadata', JSON.parse(text));
      },
    });
  const active = body('active'),
    trashed = body('trashed'),
    preparing = body('preparing'),
    independent = body('independent', 'backup'),
    legacy = body('legacy');
  const decoy = body('decoy');
  active.properties = { arbitrary: { bodyRef: decoy.bodyRef } };
  const version = put('live', 'version', { format: 'smena-knowledge-version-v1', snapshot: { title: 'Prior' } });
  active.history = [{ id: 'version', contentRef: { ...version, kind: 'knowledge-version-v1' } }];
  const index = put('live', 'search', { format: 'smena-knowledge-directory-v1', data: 'derived fixture' });
  const preparingSource = put('backup', 'root', await stage(root(preparing)));
  const independentSource = put('backup', 'root', await stage(root(independent), 'backup'));
  const current = await stage({
    ...root(active),
    _knowledgeStorageVersion: 1,
    _knowledgeMigration: { id: 'migration', state: 'complete', processed: 2 },
    trash: [{ id: 'trash', kind: 'note', data: { note: trashed } }],
    _knowledgeImports: [{ id: 'paused', by: 'owner', state: 'paused', backupPreparation: { format: 'smena-backup-preparation-v1', source: preparingSource } }],
    _knowledgeSearch: { version: 1, parts: [], directory: index },
  });
  const read = async object => {
    reads.push(object);
    assert.ok(['metadata', 'root'].includes(object.kind), 'source bodies and leaf objects are never read by reachability');
    const found = objects.get(`${object.area}:${object.sha256}`);
    if (!found) throw Object.assign(Error('Missing'), { code: 'ENOENT' });
    return found.text;
  };
  return { objects, reads, read, current, active, independent, decoy, legacy, independentSource, root };
}
const now = Date.parse('2026-11-07T12:00:00Z'),
  day = 86400000;
const inventoryOf = f =>
  [...f.objects.values()].map(object => ({
    area: object.area,
    kind: object.kind,
    sha256: object.sha256,
    bytes: object.bytes,
    id: object.sha256,
    owned: true,
    recognizedFormat: true,
    integrityChecked: true,
    createdAt: new Date(now - 60 * day).toISOString(),
  }));

test('resumable inspection protects active/trash/version/search/import/backup references without reading source bodies', async () => {
  const f = await fixture();
  let state = await beginKnowledgeReachability({
    root: f.current,
    backupsComplete: true,
    backups: [{ format: 'smena-prepared-backup-v1', source: f.independentSource }, { data: f.root(f.legacy) }],
  });
  const originalFingerprint = state.rootFingerprint;
  let steps = 0;
  while (state.pending.length) {
    const baseline = structuredClone(state),
      count = f.reads.length;
    state = await stepKnowledgeReachability(JSON.parse(JSON.stringify(state)), f.read);
    assert.deepEqual(baseline.rootFingerprint, state.rootFingerprint);
    assert.ok(f.reads.length - count <= 2, 'one descriptor, with an optional independent-to-canonical fallback');
    assert.equal(state.inspected, ++steps);
    assert.ok(steps < 100);
  }
  assert.equal(state.rootFingerprint, originalFingerprint);
  assert.equal(state.reachable['live:body:' + f.independent.bodyRef.sha256], undefined);
  assert.ok(state.reachable['backup:' + f.independent.bodyRef.sha256]);
  assert.equal(state.reachable['live:body:' + f.decoy.bodyRef.sha256], undefined, 'custom data cannot manufacture canonical references');
  const inventory = inventoryOf(f),
    observations = Object.fromEntries(inventory.map(object => [`${object.area}:${object.id}`, now - 40 * day]));
  const inspect = (items, options) => previewKnowledgeMaintenance(state, items, { now, currentRootFingerprint: state.rootFingerprint, ...options });
  const preview = inspect(inventory, { inventoryComplete: true, observations });
  assert.equal(preview.complete, true);
  assert.equal(preview.counts.unreferenced, 1);
  assert.equal(preview.candidates[0].sha256, f.decoy.bodyRef.sha256);
  assert.equal(preview.deletionEnabled, false);
  const publicReport = JSON.stringify(publicKnowledgeMaintenancePreview(preview));
  assert.equal(publicReport.includes(f.active.bodyRef.sha256), false);
  assert.equal(publicReport.includes(f.decoy.bodyRef.sha256), false);
  assert.equal(publicReport.includes('PRIVATE'), false);
  assert.equal(
    JSON.stringify(publicKnowledgeMaintenancePreview({ ...preview, counts: { ...preview.counts, storagePath: 'PRIVATE' } })).includes('PRIVATE'),
    false,
  );
  assert.equal(JSON.stringify(state).includes('PRIVATE source'), false);
  assert.ok(
    f.reads.some(read => read.area === 'backup' && !f.objects.has(`backup:${read.sha256}`)),
    'partial copy metadata fallback was exercised',
  );
  assert.equal(inspect(inventory, { inventoryComplete: true }).candidates.length, 0, 'old creation time does not skip first-observation retention');
  assert.equal(inspect(inventory, { observations }).complete, false, 'a partial inventory cannot authorize cleanup');
  const missing = inventory.filter(object => object.sha256 !== f.active.bodyRef.sha256);
  const incomplete = inspect(missing, { inventoryComplete: true, observations });
  assert.equal(incomplete.complete, false);
  assert.ok(incomplete.missing);
  assert.deepEqual(incomplete.candidates, []);
  const unknown = inventory.concat({ ...inventory[0], id: 'unknown-format', sha256: hash('future'), recognizedFormat: false });
  assert.equal(inspect(unknown, { inventoryComplete: true, observations }).complete, false);
  const stale = inspect(inventory, { inventoryComplete: true, observations, currentRootFingerprint: 'changed-root' });
  assert.equal(stale.complete, false);
  assert.equal(stale.counts.unclassified, 1);
  assert.deepEqual(stale.candidates, []);
  assert.equal(
    previewKnowledgeMaintenance({ ...state, rootsComplete: false }, inventory, {
      now,
      currentRootFingerprint: state.rootFingerprint,
      inventoryComplete: true,
      observations,
    }).complete,
    false,
  );
  assert.throws(() => inspect(inventory.concat(inventory[0]), { inventoryComplete: true }), {
    code: 'KNOWLEDGE_MAINTENANCE_INTEGRITY',
  });
});

test('unknown snapshots, corrupt parts and failed reads never advance an inspection cursor', async () => {
  const f = await fixture();
  await assert.rejects(beginKnowledgeReachability({ root: f.current, backups: [{ format: 'future-copy-v2', data: f.current }] }), {
    code: 'KNOWLEDGE_MAINTENANCE_FORMAT_UNSUPPORTED',
  });
  const state = await beginKnowledgeReachability({ root: f.current });
  const original = JSON.stringify(state);
  await assert.rejects(
    stepKnowledgeReachability(state, async () => '{}'),
    { code: 'KNOWLEDGE_MAINTENANCE_INTEGRITY' },
  );
  assert.equal(JSON.stringify(state), original);
  await assert.rejects(
    stepKnowledgeReachability(state, async () => {
      throw Object.assign(Error('Retry'), { statusCode: 503 });
    }),
    { statusCode: 503 },
  );
  assert.equal(JSON.stringify(state), original);
  const future = structuredClone(f.current);
  future._knowledgeFuture = { source: 'unknown' };
  await assert.rejects(beginKnowledgeReachability({ root: future }), { code: 'KNOWLEDGE_MAINTENANCE_FORMAT_UNSUPPORTED' });
  const futureVersion = { ...f.current, _knowledgeStorageVersion: 2 };
  await assert.rejects(beginKnowledgeReachability({ root: futureVersion }), { code: 'KNOWLEDGE_MAINTENANCE_FORMAT_UNSUPPORTED' });
});

test('10,001 note references remain bounded and require metadata reads only', async () => {
  const objects = new Map();
  const notes = Array.from({ length: 10001 }, (_, i) => ({
    id: 'large-' + i,
    title: 'Note ' + i,
    bodyRef: { kind: 'knowledge-body-v1', sha256: hash('body-' + i), bytes: 128 },
  }));
  const root = await stageKnowledgeMetadata(
    { schemaVersion: 3, _aggregateVersion: 1, knowledgeNotes: notes, knowledgeFolders: [] },
    {
      async writeKnowledgeMetadata(text, sha256) {
        objects.set(sha256, text);
      },
    },
  );
  let state = await beginKnowledgeReachability({ root, backupsComplete: true }),
    reads = 0;
  while (state.pending.length) {
    state = await stepKnowledgeReachability(state, async object => {
      assert.equal(object.area, 'live');
      assert.equal(object.kind, 'metadata');
      reads++;
      return objects.get(object.sha256);
    });
  }
  assert.equal(reads, objects.size);
  assert.equal(reads, root._knowledgeCatalog.fields.knowledgeNotes.length);
  assert.ok(reads < notes.length / 10);
  for (const note of notes) assert.ok(state.reachable['live:body:' + note.bodyRef.sha256]);
  assert.ok(Buffer.byteLength(JSON.stringify(state)) < 4 * 1024 * 1024);
  const inventory = [
    ...notes.map(note => ({ area: 'live', kind: 'body', sha256: note.bodyRef.sha256, bytes: note.bodyRef.bytes })),
    ...[...objects].map(([sha256, text]) => ({ area: 'live', kind: 'metadata', sha256, bytes: Buffer.byteLength(text) })),
  ].map(object => ({
    ...object,
    id: object.sha256,
    owned: true,
    recognizedFormat: true,
    integrityChecked: true,
    createdAt: new Date(now - 90 * day).toISOString(),
  }));
  const result = previewKnowledgeMaintenance(state, inventory, { now, inventoryComplete: true, currentRootFingerprint: state.rootFingerprint });
  assert.equal(result.complete, true);
  assert.equal(result.counts.reachable, inventory.length);
  assert.equal(result.counts.unreferenced, 0);
  assert.deepEqual(result.candidates, []);
});

test('metadata hashes cannot substitute another collection or a different declared note identity', async () => {
  const f = await fixture(),
    part = f.current._knowledgeCatalog.fields.knowledgeNotes[0];
  const fakeText = JSON.stringify({
    format: 'smena-knowledge-metadata-v1',
    field: 'knowledgeFolders',
    prefix: part.prefix,
    rows: [['active', { id: 'active', name: 'Folder' }]],
  });
  const wrongField = structuredClone(f.current);
  Object.assign(wrongField._knowledgeCatalog.fields.knowledgeNotes[0], { sha256: hash(fakeText), bytes: Buffer.byteLength(fakeText) });
  let otherId;
  for (let i = 0; ; i++)
    if (hash('other-' + i).startsWith(part.prefix)) {
      otherId = 'other-' + i;
      break;
    }
  const wrongIdentity = structuredClone(f.current);
  wrongIdentity.knowledgeNotes[0].id = otherId;
  for (const root of [wrongField, wrongIdentity]) {
    let state = await beginKnowledgeReachability({ root });
    const targetHash = root._knowledgeCatalog.fields.knowledgeNotes[0].sha256;
    let rejected = false;
    for (let step = 0; state.pending.length && step < 100; step++) {
      const read = object => (object.sha256 === hash(fakeText) ? fakeText : f.read(object));
      if (state.pending.at(-1).object.sha256 === targetHash) {
        const before = JSON.stringify(state);
        await assert.rejects(stepKnowledgeReachability(state, read), { code: 'KNOWLEDGE_MAINTENANCE_INTEGRITY' });
        assert.equal(JSON.stringify(state), before);
        rejected = true;
        break;
      }
      state = await stepKnowledgeReachability(state, read);
    }
    assert.equal(rejected, true);
  }
  const wrongPrefix = structuredClone(f.current);
  wrongPrefix._knowledgeCatalog.fields.knowledgeNotes[0].prefix += hash('active')[part.prefix.length] === '0' ? '1' : '0';
  await assert.rejects(beginKnowledgeReachability({ root: wrongPrefix }), { code: 'KNOWLEDGE_MAINTENANCE_INTEGRITY' });
});
