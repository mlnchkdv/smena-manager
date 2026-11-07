import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { LocalStorageProvider } from '../../src/server/storage/local-storage.js';
import { beginPreparedBackup, advancePreparedBackup } from '../../src/server/prepared-workspace-backup.js';
import { storeKnowledgeBody } from '../../src/server/knowledge-body-store.js';
import { persistKnowledgeVersion } from '../../src/server/knowledge-version-blobs.js';
import { stageKnowledgeMetadata } from '../../src/server/storage/knowledge-metadata-shards.js';
import { writeCatalogShards } from '../../src/server/storage/file-catalog-shards.js';
import { stageKnowledgeSearch } from '../../src/server/knowledge-search-store.js';

test('cold copy resumes one object at a time, survives lost replies, and restores without live objects', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'smena-prepared-copy-'));
  const old = process.env.KNOWLEDGE_METADATA_SHARDS_ENABLED;
  process.env.KNOWLEDGE_METADATA_SHARDS_ENABLED = 'true';
  try {
    const storage = new LocalStorageProvider(path.join(directory, 'workspace.json'));
    const notes = [];
    for (let i = 0; i < 60; i++)
      notes.push(
        await storeKnowledgeBody(storage, {
          id: 'n' + i,
          title: 'Note ' + i,
          formatted_markdown: i === 59 ? 'Large source '.repeat(180000) : 'Exact content ' + i,
        }),
      );
    notes[0].history = [await persistKnowledgeVersion(storage, 'n0', { id: 'v1', title: 'Old title', formatted_markdown: 'Earlier exact text', at: 123 })];
    const trashNote = await storeKnowledgeBody(storage, { id: 'trashed', title: 'In trash', formatted_markdown: 'Preserved trash source' });
    const files = [{ id: 'f1', name: 'a.txt', project: 'p1', bytes: 3 }],
      catalog = new Map();
    storage.readCatalogPart = async id => catalog.get(id);
    let source = {
      schemaVersion: 3,
      _aggregateVersion: 1,
      revision: 17,
      projects: [{ id: 'p1' }],
      members: [{ id: 'm1' }],
      files,
      knowledgeNotes: notes,
      knowledgeFolders: [],
      trash: [{ kind: 'note', data: { note: trashNote } }],
    };
    await stageKnowledgeSearch(source, {}, storage);
    source = await stageKnowledgeMetadata(source, storage);
    source = await writeCatalogShards(source, null, async (text, hash) => {
      catalog.set(hash, text);
      return hash;
    });
    let reads = 0;
    for (const name of ['readKnowledgeBody', 'readKnowledgeVersion', 'readKnowledgeMetadata', 'readKnowledgeSearch', 'readCatalogPart']) {
      const fn = storage[name].bind(storage);
      storage[name] = async (...args) => {
        reads++;
        return fn(...args);
      };
    }
    let job = await beginPreparedBackup(storage, source, 'Bounded recovery copy');
    assert.equal(reads, 0, 'begin must not read cold children');
    assert.equal((await storage.listDatabaseBackups()).length, 0, 'incomplete copies are not shown as backups');
    const first = await advancePreparedBackup(storage, job);
    assert.equal(reads, 1);
    const replay = await advancePreparedBackup(storage, JSON.parse(JSON.stringify(job)));
    assert.deepEqual(replay, first);
    job = first;
    while (job.pending.length) {
      const before = reads;
      job = await advancePreparedBackup(storage, JSON.parse(JSON.stringify(job)));
      assert.ok(reads - before <= 1);
    }
    assert.equal((await storage.listDatabaseBackups()).length, 0);
    const complete = await advancePreparedBackup(storage, job),
      retry = await advancePreparedBackup(storage, JSON.parse(JSON.stringify(job)));
    assert.equal(complete.backup.id, retry.backup.id);
    assert.equal((await storage.listDatabaseBackups()).length, 1);
    for (const name of ['readKnowledgeBody', 'readKnowledgeVersion', 'readKnowledgeMetadata', 'readKnowledgeSearch', 'readCatalogPart'])
      storage[name] = async () => {
        throw Error('Live source must not be used');
      };
    const restored = await storage.loadDatabaseBackup(complete.backup.id);
    assert.equal(restored.revision, 17);
    assert.equal(restored.knowledgeNotes.length, 60);
    assert.equal(restored.knowledgeNotes.find(n => n.id === 'n59').formatted_markdown, 'Large source '.repeat(180000));
    assert.equal(restored.knowledgeNotes.find(n => n.id === 'n0').history[0].formatted_markdown, 'Earlier exact text');
    assert.equal(restored.trash[0].data.note.formatted_markdown, 'Preserved trash source');
    assert.deepEqual(restored.files, files);
    assert.equal(restored._knowledgeCatalog, undefined);
    let repeated = await beginPreparedBackup(storage, source, 'Cold repeat using independent verified objects');
    while (repeated.state !== 'complete') repeated = await advancePreparedBackup(storage, repeated);
    assert.ok(repeated.backup.id);
    assert.equal((await storage.listDatabaseBackups()).length, 2);
  } finally {
    if (old === undefined) delete process.env.KNOWLEDGE_METADATA_SHARDS_ENABLED;
    else process.env.KNOWLEDGE_METADATA_SHARDS_ENABLED = old;
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('corrupt immutable source cannot advance the journal or publish a recovery copy', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'smena-prepared-corrupt-'));
  try {
    const storage = new LocalStorageProvider(path.join(directory, 'workspace.json'));
    const note = await storeKnowledgeBody(storage, { id: 'note', formatted_markdown: 'Exact source' });
    const job = await beginPreparedBackup(storage, { _aggregateVersion: 1, schemaVersion: 3, knowledgeNotes: [note] });
    storage.readKnowledgeBody = async () => 'tampered';
    await assert.rejects(advancePreparedBackup(storage, job), error => error.code === 'BACKUP_PREPARATION_INTEGRITY');
    assert.equal(job.pending.length, 1);
    assert.equal((await storage.listDatabaseBackups()).length, 0);
    await assert.rejects(storage.writeWorkspaceBackupObject('not its hash', '0'.repeat(64)), /integrity/);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
