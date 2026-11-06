import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { stageKnowledgeMetadata, materializeKnowledgeMetadata } from '../../src/server/storage/knowledge-metadata-shards.js';
import { resetKnowledgeSearchCache } from '../../src/server/knowledge-search-cache.js';
import { GoogleDriveStorageProvider } from '../../src/server/storage/google-drive.js';
import { createEmptyDatabase } from '../../src/server/workspace-store.js';
import { writeCatalogShards } from '../../src/server/storage/file-catalog-shards.js';
import { LocalStorageProvider } from '../../src/server/storage/local-storage.js';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const old = process.env.KNOWLEDGE_METADATA_SHARDS_ENABLED,
  gate = process.env.KNOWLEDGE_CATALOG_ENABLED;
test.beforeEach(() => {
  process.env.KNOWLEDGE_METADATA_SHARDS_ENABLED = 'true';
  process.env.KNOWLEDGE_CATALOG_ENABLED = 'true';
  resetKnowledgeSearchCache();
});
test.afterEach(() => {
  if (old === undefined) delete process.env.KNOWLEDGE_METADATA_SHARDS_ENABLED;
  else process.env.KNOWLEDGE_METADATA_SHARDS_ENABLED = old;
  if (gate === undefined) delete process.env.KNOWLEDGE_CATALOG_ENABLED;
  else process.env.KNOWLEDGE_CATALOG_ENABLED = gate;
  resetKnowledgeSearchCache();
});
function fixture() {
  const objects = new Map(),
    reads = [],
    writes = [];
  return {
    objects,
    reads,
    writes,
    storage: {
      async readKnowledgeMetadata(hash) {
        reads.push(hash);
        return objects.get(hash);
      },
      async writeKnowledgeMetadata(text, hash) {
        assert.equal(createHash('sha256').update(text).digest('hex'), hash);
        writes.push(hash);
        objects.set(hash, text);
      },
    },
  };
}
test('10,001 large metadata rows leave a small fail-closed root and round-trip exactly', async () => {
  const f = fixture(),
    source = {
      schemaVersion: 3,
      revision: 9,
      members: [{ id: 'member' }],
      files: [{ id: 'file', project: 'private' }],
      knowledgeNotes: Array.from({ length: 10001 }, (_, i) => ({
        id: 'note-' + i,
        title: 'Заметка / Note ' + i,
        summary: 'body preview '.repeat(45),
        folderId: 'folder',
        tags: ['team'],
        wikiRefs: [],
        wikilinks: [],
      })),
      knowledgeFolders: [{ id: 'folder', name: 'Folder' }],
      _knowledgeImports: [{ id: 'job', by: 'member', entries: [{ key: 'entry', status: 'imported', noteId: 'note-0' }] }],
      _knowledgeSearch: { version: 1, parts: [] },
    };
  assert.ok(Buffer.byteLength(JSON.stringify(source)) > 4 * 1024 * 1024);
  const root = await stageKnowledgeMetadata(source, f.storage);
  assert.equal(root.schemaVersion, 4);
  assert.ok(Buffer.byteLength(JSON.stringify(root)) < 512 * 1024);
  assert.equal(root.knowledgeNotes[0].summary, undefined);
  assert.equal(root._knowledgeSearch, undefined);
  const expanded = await materializeKnowledgeMetadata(root, f.storage);
  delete expanded._knowledgeCatalog;
  assert.deepEqual(expanded, source);
  resetKnowledgeSearchCache();
  f.reads.length = 0;
  const selected = await materializeKnowledgeMetadata(root, f.storage, { ids: ['note-9999'], fields: ['knowledgeNotes'] });
  assert.equal(selected.knowledgeNotes.length, 1);
  assert.equal(selected.knowledgeNotes[0].id, 'note-9999');
  assert.equal(f.reads.length, 1);
  assert.equal(selected._knowledgeImports[0].entries, undefined);
  resetKnowledgeSearchCache();
  f.reads.length = 0;
  const projection = await materializeKnowledgeMetadata(root, f.storage, { knowledge: false });
  assert.equal(f.reads.length, 0);
  const preserved = await stageKnowledgeMetadata({ ...projection, revision: 10 }, f.storage, projection);
  assert.deepEqual(preserved._knowledgeCatalog, root._knowledgeCatalog);
  assert.deepEqual(preserved.files, source.files);
  const altered = structuredClone(projection);
  altered.knowledgeNotes.pop();
  await assert.rejects(stageKnowledgeMetadata(altered, f.storage, projection), { code: 'KNOWLEDGE_METADATA_INTEGRITY' });
});
test('only changed buckets are published; failure and corruption cannot replace the catalog', async () => {
  const f = fixture(),
    source = { schemaVersion: 3, knowledgeNotes: Array.from({ length: 300 }, (_, i) => ({ id: 'n' + i, title: 'Original ' + i })), knowledgeFolders: [] };
  const root = await stageKnowledgeMetadata(source, f.storage);
  const expanded = await materializeKnowledgeMetadata(root, f.storage);
  f.writes.length = 0;
  expanded.knowledgeNotes[0].title = 'Changed';
  const next = await stageKnowledgeMetadata(expanded, f.storage, root);
  assert.equal(f.writes.length, 1);
  assert.equal((await materializeKnowledgeMetadata(next, f.storage)).knowledgeNotes[0].title, 'Changed');
  const bad = structuredClone(root);
  bad._knowledgeCatalog.fields.knowledgeNotes[0].sha256 = '0'.repeat(64);
  resetKnowledgeSearchCache();
  await assert.rejects(materializeKnowledgeMetadata(bad, f.storage), { code: 'KNOWLEDGE_METADATA_INTEGRITY' });
  const before = JSON.stringify(root);
  f.storage.writeKnowledgeMetadata = async () => {
    throw Error('Storage interruption');
  };
  expanded.knowledgeNotes[1].title = 'Another change';
  await assert.rejects(stageKnowledgeMetadata(expanded, f.storage, root), /Storage interruption/);
  assert.equal(JSON.stringify(root), before);
});

test('Drive metadata writes keep file pointers and CAS while returning complete logical records', async () => {
  const f = fixture(),
    data = {
      ...createEmptyDatabase(),
      _aggregateVersion: 1,
      revision: 9,
      members: [{ id: 'owner', role: 'Owner' }],
      projects: [{ id: 'p', fileFolders: [] }],
      files: [{ id: 'f', project: 'p', name: 'Private file', bytes: 10 }],
      knowledgeNotes: [{ id: 'n', title: 'Original', wikiRefs: [], wikilinks: [] }],
      knowledgeFolders: [],
      _documentRevisions: { knowledge: { revision: 0 }, bookmarks: { revision: 0 } },
    };
  const fileRoot = await writeCatalogShards(data, null, async () => 'file-part');
  let raw = await stageKnowledgeMetadata(fileRoot, f.storage);
  const provider = new GoogleDriveStorageProvider();
  provider.init = async () => {};
  provider.rootFolderId = 'own';
  provider.databaseFileId = 'root';
  provider.findDatabaseFile = async () => 'root';
  provider.readVersionedJson = async () => ({ data: structuredClone(raw), headers: { etag: 'baseline' } });
  provider.readKnowledgeMetadata = f.storage.readKnowledgeMetadata;
  provider.writeKnowledgeMetadata = f.storage.writeKnowledgeMetadata;
  provider.readCatalogPart = async () => {
    throw Error('Unrelated file row read');
  };
  resetKnowledgeSearchCache();
  f.reads.length = 0;
  const core = await provider.loadDatabaseCore({ knowledge: false, identities: false });
  assert.equal(f.reads.length, 0);
  assert.equal(core.knowledgeNotes[0].title, undefined);
  const baseline = await provider.loadDatabaseMetadata(),
    next = structuredClone(baseline);
  next.knowledgeNotes[0].title = 'Changed';
  next.revision++;
  next.updatedAt = new Date().toISOString();
  next._documentRevisions.knowledge = { revision: 1, createdAt: next.createdAt, updatedAt: next.updatedAt };
  let published;
  provider.updateVersionedJson = async (args, options) => {
    assert.equal(options.headers['If-Match'], 'baseline');
    let text = '';
    for await (const chunk of args.media.body) text += chunk;
    published = JSON.parse(text);
    raw = published;
    return { headers: { etag: 'next' } };
  };
  const saved = await provider.saveDatabaseMetadata(next, baseline, { scope: 'knowledge' });
  assert.equal(saved.schemaVersion, 3);
  assert.equal(saved.knowledgeNotes[0].title, 'Changed');
  assert.equal(published.schemaVersion, 4);
  assert.equal(published.knowledgeNotes[0].title, undefined);
  assert.deepEqual(published._fileCatalog.shards, fileRoot._fileCatalog.shards);
  const stale = await provider.loadDatabaseMetadata();
  const changed = structuredClone(stale);
  changed.revision++;
  changed.updatedAt = new Date().toISOString();
  changed.knowledgeNotes[0].title = 'Losing write';
  changed._documentRevisions.knowledge.revision++;
  const before = JSON.stringify(raw);
  provider.updateVersionedJson = async () => {
    throw Object.assign(new Error('CAS'), { code: 412 });
  };
  await assert.rejects(provider.saveDatabaseMetadata(changed, stale, { scope: 'knowledge' }), { code: 412 });
  assert.equal(JSON.stringify(raw), before);
});

test('membership is checked before child reads and malformed manifests never become empty catalogs', async () => {
  const f = fixture(),
    source = { schemaVersion: 3, knowledgeNotes: [{ id: 'n', title: 'Secret' }], knowledgeFolders: [] };
  const root = await stageKnowledgeMetadata(source, f.storage);
  await assert.rejects(
    materializeKnowledgeMetadata(root, f.storage, {
      authorize: () => {
        throw Object.assign(Error('Denied'), { statusCode: 403 });
      },
    }),
    { statusCode: 403 },
  );
  assert.equal(f.reads.length, 0);
  for (const alter of [
    r => delete r._knowledgeCatalog,
    r => r.knowledgeNotes.push({ id: 'n' }),
    r => r._knowledgeCatalog.fields.knowledgeNotes.push(r._knowledgeCatalog.fields.knowledgeNotes[0]),
  ]) {
    const bad = structuredClone(root);
    alter(bad);
    await assert.rejects(materializeKnowledgeMetadata(bad, f.storage), { code: 'KNOWLEDGE_METADATA_INTEGRITY' });
  }
});

test('local disk restart, missing parts and failed staging preserve the last complete root', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'smena-meta-'));
  try {
    const target = path.join(directory, 'workspace.json');
    const provider = new LocalStorageProvider(target);
    const data = { schemaVersion: 3, knowledgeNotes: [{ id: 'n', title: 'Original' }], knowledgeFolders: [] };
    await provider.saveDatabase(data);
    const saved = await fs.readFile(target, 'utf8');
    const restarted = new LocalStorageProvider(target);
    const loaded = await restarted.loadDatabase();
    assert.equal(loaded.knowledgeNotes[0].title, 'Original');
    restarted.writeKnowledgeMetadata = async () => {
      throw Error('Interrupted');
    };
    loaded.knowledgeNotes[0].title = 'Changed';
    await assert.rejects(restarted.saveDatabase(loaded), /Interrupted/);
    assert.equal(await fs.readFile(target, 'utf8'), saved);
    resetKnowledgeSearchCache();
    const root = JSON.parse(saved),
      hash = root._knowledgeCatalog.fields.knowledgeNotes[0].sha256;
    await fs.unlink(path.join(directory, 'knowledge-metadata', hash + '.json'));
    await assert.rejects(new LocalStorageProvider(target).loadDatabase(), { code: 'KNOWLEDGE_METADATA_INTEGRITY' });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
