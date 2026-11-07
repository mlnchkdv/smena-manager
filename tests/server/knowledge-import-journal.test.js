import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { localKnowledgeImportJournals, driveKnowledgeImportJournals } from '../../src/server/storage/knowledge-import-journal.js';
import { stageKnowledgeMetadata } from '../../src/server/storage/knowledge-metadata-shards.js';
import { rememberStorageVersion } from '../../src/server/storage/version-token.js';
import { resetKnowledgeSearchCache } from '../../src/server/knowledge-search-cache.js';

const gates = ['KNOWLEDGE_CATALOG_ENABLED', 'KNOWLEDGE_METADATA_SHARDS_ENABLED'];
let previous;
test.beforeEach(() => {
  previous = gates.map(key => process.env[key]);
  for (const key of gates) process.env[key] = 'true';
  resetKnowledgeSearchCache();
});
test.afterEach(() => {
  gates.forEach((key, i) => {
    if (previous[i] === undefined) delete process.env[key];
    else process.env[key] = previous[i];
  });
  resetKnowledgeSearchCache();
});
async function fixture(count = 2) {
  const objects = new Map(),
    reads = [];
  const storage = {
    async readKnowledgeMetadata(hash) {
      reads.push(hash);
      if (!objects.has(hash)) throw Error('Missing metadata');
      return objects.get(hash);
    },
    async writeKnowledgeMetadata(text, hash) {
      assert.equal(createHash('sha256').update(text).digest('hex'), hash);
      objects.set(hash, text);
    },
  };
  const root = await stageKnowledgeMetadata(
    {
      schemaVersion: 3,
      _aggregateVersion: 1,
      revision: 7,
      updatedAt: '2026-11-01T00:00:00.000Z',
      members: [{ id: 'owner', role: 'Owner' }],
      futureField: { preserved: true },
      knowledgeNotes: Array.from({ length: count }, (_, i) => ({ id: 'note-' + i, title: 'Private note ' + i, summary: 'Original' })),
      knowledgeFolders: [{ id: 'folder', name: 'Private folder' }],
      _knowledgeImports: [{ id: 'job', by: 'owner', state: 'preparing', entries: [] }],
    },
    storage,
  );
  resetKnowledgeSearchCache();
  return { storage, root, reads };
}
const authorize = root => assert.equal(root.members[0].id, 'owner');

test('10,001-note journal checkpoints read no note/folder parts and preserve the material revision', async t => {
  const f = await fixture(10001),
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'smena-journal-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  f.storage.databasePath = path.join(directory, 'root.json');
  await fs.writeFile(f.storage.databasePath, JSON.stringify(f.root));
  Object.assign(f.storage, localKnowledgeImportJournals(f.storage));
  await assert.rejects(
    f.storage.loadKnowledgeImportJournal({
      authorize: () => {
        throw Object.assign(Error('Denied'), { statusCode: 403 });
      },
    }),
    { statusCode: 403 },
  );
  assert.equal(f.reads.length, 0, 'authorize before any child read');
  const baseline = await f.storage.loadKnowledgeImportJournal({ authorize });
  const journalHashes = new Set(f.root._knowledgeCatalog.fields._knowledgeImports.map(part => part.sha256));
  assert.ok(f.reads.length > 0);
  assert.ok(f.reads.every(hash => journalHashes.has(hash)));
  assert.equal(baseline.knowledgeNotes[9999].title, undefined);
  const next = structuredClone(baseline);
  next._knowledgeImports[0].state = 'paused';
  await f.storage.saveKnowledgeImportJournal(next, baseline);
  const published = JSON.parse(await fs.readFile(f.storage.databasePath, 'utf8'));
  assert.equal(published.revision, 7);
  assert.equal(published.updatedAt, f.root.updatedAt);
  assert.equal(published._knowledgeImportRevision, 1);
  assert.deepEqual(published.knowledgeNotes, f.root.knowledgeNotes);
  assert.deepEqual(published._knowledgeCatalog.fields.knowledgeNotes, f.root._knowledgeCatalog.fields.knowledgeNotes);
  assert.deepEqual(published._knowledgeCatalog.fields.knowledgeFolders, f.root._knowledgeCatalog.fields.knowledgeFolders);
  assert.deepEqual(published.futureField, f.root.futureField);
  const illegal = structuredClone(next);
  illegal.members[0].role = 'Guest';
  await assert.rejects(f.storage.saveKnowledgeImportJournal(illegal, baseline), { code: 'METADATA_WRITE_FORBIDDEN' });
  assert.equal(JSON.parse(await fs.readFile(f.storage.databasePath, 'utf8')).members[0].role, 'Owner');
  await assert.rejects(f.storage.saveKnowledgeImportJournal(next, baseline), { code: 'REVISION_CONFLICT' });
});

test('Drive checkpoints use the captured root identity and ETag, never a later provider cursor', async () => {
  const f = await fixture();
  let raw = structuredClone(f.root),
    etag = 'original-etag',
    calls = 0;
  f.storage.databaseFileId = 'original-root';
  f.storage.readDatabaseRoot = async () => rememberStorageVersion(structuredClone(raw), etag);
  f.storage.client = {
    files: {
      update: async (args, options) => {
        calls++;
        assert.equal(args.fileId, 'original-root');
        assert.equal(options.headers['If-Match'], 'original-etag');
        if (etag !== options.headers['If-Match']) throw Object.assign(Error('Concurrent write'), { code: 412 });
        let text = '';
        for await (const chunk of args.media.body) text += chunk;
        raw = JSON.parse(text);
        etag = 'next-etag';
      },
    },
  };
  Object.assign(f.storage, driveKnowledgeImportJournals(f.storage));
  await assert.rejects(
    f.storage.loadKnowledgeImportJournal({
      authorize: () => {
        throw Object.assign(Error('Denied'), { statusCode: 403 });
      },
    }),
    { statusCode: 403 },
  );
  assert.equal(f.reads.length, 0);
  const baseline = await f.storage.loadKnowledgeImportJournal({ authorize });
  f.storage.databaseFileId = 'unrelated-root';
  const next = structuredClone(baseline);
  next._knowledgeImports[0].state = 'paused';
  await f.storage.saveKnowledgeImportJournal(next, baseline);
  assert.equal(raw.revision, 7);
  assert.equal(raw._knowledgeImportRevision, 1);
  assert.deepEqual(raw._knowledgeCatalog.fields.knowledgeNotes, f.root._knowledgeCatalog.fields.knowledgeNotes);
  assert.deepEqual(raw.futureField, f.root.futureField);
  const committed = JSON.stringify(raw);
  await assert.rejects(f.storage.saveKnowledgeImportJournal(next, baseline), { code: 412 });
  assert.equal(JSON.stringify(raw), committed);
  assert.equal(calls, 2);
});

test('a malformed private revision fails before publishing a root', async t => {
  const f = await fixture(),
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'smena-journal-limit-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  f.storage.databasePath = path.join(directory, 'root.json');
  f.root._knowledgeImportRevision = Number.MAX_SAFE_INTEGER;
  const original = JSON.stringify(f.root);
  await fs.writeFile(f.storage.databasePath, original);
  Object.assign(f.storage, localKnowledgeImportJournals(f.storage));
  const baseline = await f.storage.loadKnowledgeImportJournal({ authorize });
  await assert.rejects(f.storage.saveKnowledgeImportJournal(structuredClone(baseline), baseline), { code: 'KNOWLEDGE_METADATA_INTEGRITY' });
  assert.equal(await fs.readFile(f.storage.databasePath, 'utf8'), original);
});
