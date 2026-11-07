import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { getStorageProvider, resetStorageProvider } from '../../src/server/storage/index.js';
import { createEmptyDatabase, getWorkspaceDatabase, resetWorkspaceStore } from '../../src/server/workspace-store.js';
import {
  startKnowledgeImport,
  appendKnowledgeImport,
  readKnowledgeImports,
  controlKnowledgeImport,
  prepareKnowledgeImport,
} from '../../src/server/knowledge-import-store.js';
import { storeKnowledgeBody } from '../../src/server/knowledge-body-store.js';
import { readKnowledgeNote } from '../../src/server/knowledge-note-store.js';
import { queryKnowledgeIndex } from '../../src/server/knowledge-search-query.js';
import { inWorkspace } from '../../src/server/workspace-context.js';
const hash = text => createHash('sha256').update(text).digest('hex');
const profile = id => ({ id, email: id + '@example.test', role: id === 'viewer' ? 'viewer' : 'editor' });
const entry = (name, source) => ({ name, size: Buffer.byteLength(source), key: hash(name + source), sourceHash: hash(source) });
const old = { path: process.env.DATABASE_PATH, gate: process.env.KNOWLEDGE_CATALOG_ENABLED };
let directory;
test.beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'smena-import-journal-'));
  process.env.DATABASE_PATH = path.join(directory, 'workspace.json');
  process.env.KNOWLEDGE_CATALOG_ENABLED = 'true';
  resetStorageProvider();
  resetWorkspaceStore();
  await getStorageProvider().saveDatabase({
    ...createEmptyDatabase(),
    _aggregateVersion: 1,
    _documentRevisions: { knowledge: { revision: 0 } },
    members: ['owner', 'editor', 'viewer', 'other'].map(id => ({
      id,
      name: id,
      email: id + '@example.test',
      role: id === 'owner' ? 'Owner' : id === 'viewer' ? 'Guest' : 'Member',
      status: 'active',
    })),
    knowledgeFolders: [{ id: 'folder', name: 'Target' }],
    knowledgeNotes: [],
    me: 'owner',
  });
});
test.afterEach(async () => {
  resetStorageProvider();
  resetWorkspaceStore();
  for (const [key, value] of [
    ['DATABASE_PATH', old.path],
    ['KNOWLEDGE_CATALOG_ENABLED', old.gate],
  ]) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(directory).startsWith('smena-import-journal-'));
  await fs.rm(directory, { recursive: true, force: true });
});
test('imports more than aggregate transport size, survives restart/lost responses, keeps bodies out of journal and indexes cold content', async () => {
  const sources = Array.from({ length: 6 }, (_, i) => 'body '.repeat(210000) + '\nимпортхвост' + i);
  const entries = sources.map((s, i) => entry('Note ' + i + '.txt', s)),
    input = { clientId: randomUUID(), entries, folderId: 'folder' };
  let job = await startKnowledgeImport(input, profile('editor'));
  assert.ok(job.backupId);
  assert.equal((await startKnowledgeImport(input, profile('editor'))).id, job.id);
  for (let i = 0; i < entries.length; i++) {
    job = await appendKnowledgeImport(job.id, entries[i].key, sources[i], profile('editor'));
    resetWorkspaceStore();
    resetStorageProvider();
    const retry = await appendKnowledgeImport(job.id, entries[i].key, sources[i], profile('editor'));
    assert.equal(retry.entries[i].noteId, job.entries[i].noteId);
  }
  assert.equal(job.state, 'complete');
  const root = await getWorkspaceDatabase();
  assert.equal(root.knowledgeNotes.length, 6);
  assert.ok(root.knowledgeNotes.every(n => n.bodyRef && !Object.hasOwn(n, 'formatted_markdown') && n.folderId === 'folder'));
  assert.ok(JSON.stringify(root._knowledgeImports).length < 10000);
  const note = await readKnowledgeNote(job.entries[0].noteId, profile('editor'));
  assert.equal(note.note.formatted_markdown, sources[0]);
  assert.equal(note.note.sourceFormat, 'text');
  assert.deepEqual((await queryKnowledgeIndex(root, profile('editor'), [], { query: 'импортхвост5' })).matches, [job.entries[5].noteId]);
});
test('journal is actor-owned, rechecks revoked membership, source identity, pause and folder existence', async () => {
  const source = '# Test',
    first = entry('test.md', source),
    job = await startKnowledgeImport({ clientId: randomUUID(), entries: [first], folderId: 'folder' }, profile('editor'));
  assert.deepEqual(await readKnowledgeImports(profile('other')), []);
  await assert.rejects(appendKnowledgeImport(job.id, first.key, source, profile('other')), { code: 'KNOWLEDGE_IMPORT_NOT_FOUND' });
  await assert.rejects(appendKnowledgeImport(job.id, first.key, 'changed', profile('editor')), { code: 'KNOWLEDGE_IMPORT_SOURCE_CHANGED' });
  await controlKnowledgeImport(job.id, 'paused', profile('editor'));
  await assert.rejects(appendKnowledgeImport(job.id, first.key, source, profile('editor')), { code: 'KNOWLEDGE_IMPORT_PAUSED' });
  await controlKnowledgeImport(job.id, 'running', profile('editor'));
  await assert.rejects(startKnowledgeImport({ clientId: randomUUID(), entries: [first] }, profile('viewer')), { code: 'WORKSPACE_FORBIDDEN' });
  const db = await getWorkspaceDatabase();
  db.members.find(m => m.id === 'editor').status = 'removed';
  await getStorageProvider().saveDatabase(db);
  resetWorkspaceStore();
  await assert.rejects(appendKnowledgeImport(job.id, first.key, source, profile('editor')), { code: 'WORKSPACE_FORBIDDEN' });
  assert.equal((await getWorkspaceDatabase()).knowledgeNotes.length, 0);
});
test('duplicate skip and cancellation keep prior notes, unsafe manifests rejected', async () => {
  const source = '---\ntitle: Same\n---\nText',
    e = entry('first.md', source);
  const a = await startKnowledgeImport({ clientId: randomUUID(), entries: [e] }, profile('editor'));
  await appendKnowledgeImport(a.id, e.key, source, profile('editor'));
  const b = await startKnowledgeImport({ clientId: randomUUID(), entries: [e], policy: 'skip' }, profile('editor'));
  const skip = await appendKnowledgeImport(b.id, e.key, source, profile('editor'));
  assert.equal(skip.entries[0].status, 'skipped');
  assert.equal(skip.state, 'complete');
  assert.equal((await getWorkspaceDatabase()).knowledgeNotes.length, 1);
  await assert.rejects(startKnowledgeImport({ clientId: randomUUID(), entries: [{ ...e, name: '../bad.md' }] }, profile('editor')), {
    code: 'KNOWLEDGE_IMPORT_INVALID',
  });
  const c = await startKnowledgeImport({ clientId: randomUUID(), entries: [entry('last.md', 'last')] }, profile('editor'));
  await controlKnowledgeImport(c.id, 'canceled', profile('editor'));
  await assert.rejects(appendKnowledgeImport(c.id, c.entries[0].key, 'last', profile('editor')), { code: 'KNOWLEDGE_IMPORT_PAUSED' });
});

test('a search blob failure publishes neither the note nor its receipt; retry is safe', async () => {
  const source = 'Atomic source',
    e = entry('atomic.txt', source);
  const job = await startKnowledgeImport({ clientId: randomUUID(), entries: [e] }, profile('editor'));
  const storage = getStorageProvider(),
    write = storage.writeKnowledgeSearch.bind(storage);
  storage.writeKnowledgeSearch = async () => {
    throw Object.assign(new Error('Unavailable'), { statusCode: 503 });
  };
  await assert.rejects(appendKnowledgeImport(job.id, e.key, source, profile('editor')), { statusCode: 503 });
  assert.equal((await getWorkspaceDatabase()).knowledgeNotes.length, 0);
  assert.equal((await readKnowledgeImports(profile('editor')))[0].entries[0].status, undefined);
  storage.writeKnowledgeSearch = write;
  const saved = await appendKnowledgeImport(job.id, e.key, source, profile('editor'));
  assert.equal(saved.state, 'complete');
  assert.equal((await getWorkspaceDatabase()).knowledgeNotes.length, 1);
});

test('the same actor in another workspace cannot read or append a foreign import job', async () => {
  const source = 'Workspace bound',
    e = entry('scope.txt', source);
  const job = await startKnowledgeImport({ clientId: randomUUID(), entries: [e] }, profile('editor'));
  await inWorkspace(randomUUID(), async () => {
    await getStorageProvider().saveDatabase({
      ...createEmptyDatabase(),
      _aggregateVersion: 1,
      members: [{ ...profile('editor'), name: 'Editor', role: 'Owner', status: 'active' }],
      me: 'editor',
    });
    assert.deepEqual(await readKnowledgeImports(profile('editor')), []);
    await assert.rejects(appendKnowledgeImport(job.id, e.key, source, profile('editor')), { code: 'KNOWLEDGE_IMPORT_NOT_FOUND' });
    assert.equal((await getWorkspaceDatabase()).knowledgeNotes.length, 0);
  });
});

test('resumable recovery preparation pauses across restart and admits no files before completion', async () => {
  let storage = getStorageProvider();
  const data = await getWorkspaceDatabase();
  data.knowledgeNotes = [await storeKnowledgeBody(storage, { id: 'before-import', title: 'Before', formatted_markdown: 'Original independent source' })];
  await storage.saveDatabase(data);
  resetWorkspaceStore();
  const materialRevision = (await getWorkspaceDatabase({ fields: ['revision'] })).revision;
  const source = 'New source to import',
    item = entry('new.md', source);
  let job = await startKnowledgeImport({ clientId: randomUUID(), entries: [item], preparedBackup: true }, profile('editor'));
  assert.equal(job.state, 'preparing');
  assert.equal(job.backupPreparation, undefined);
  assert.ok(job.backupProgress);
  assert.equal((await storage.listDatabaseBackups()).length, 0);
  await assert.rejects(appendKnowledgeImport(job.id, item.key, source, profile('editor')), { code: 'KNOWLEDGE_IMPORT_BACKUP_PENDING' });
  job = await controlKnowledgeImport(job.id, 'paused', profile('editor'));
  assert.equal(job.state, 'paused');
  assert.equal((await prepareKnowledgeImport(job.id, profile('editor'))).backupProgress.copied, 0);
  resetStorageProvider();
  resetWorkspaceStore();
  storage = getStorageProvider();
  job = await controlKnowledgeImport(job.id, 'running', profile('editor'));
  assert.equal(job.state, 'preparing');
  let steps = 0;
  while (job.state === 'preparing') {
    job = await prepareKnowledgeImport(job.id, profile('editor'));
    assert.ok(++steps < 100);
  }
  assert.equal(job.state, 'running');
  assert.ok(job.backupId);
  assert.equal(job.backupProgress, undefined);
  assert.equal((await storage.listDatabaseBackups()).length, 1);
  assert.equal((await getWorkspaceDatabase({ fields: ['revision'] })).revision, materialRevision, 'private cursors must not invalidate material views');
  assert.equal((await storage.loadDatabaseBackup(job.backupId)).knowledgeNotes[0].formatted_markdown, 'Original independent source');
  job = await appendKnowledgeImport(job.id, item.key, source, profile('editor'));
  assert.equal(job.state, 'complete');
  assert.equal((await getWorkspaceDatabase({ fields: ['revision'] })).revision, materialRevision + 1);
  assert.equal((await readKnowledgeNote(job.entries[0].noteId, profile('editor'))).note.formatted_markdown, source);
});

test('preparation is owner-bound, sanitized, quota-counted, and cannot be resumed after cancel', async () => {
  const input = { entries: [entry('a.txt', 'one')], preparedBackup: true };
  const jobs = [];
  for (let i = 0; i < 3; i++) jobs.push(await startKnowledgeImport({ ...input, clientId: randomUUID() }, profile('editor')));
  const objectsBeforeLimit = await fs.readdir(path.join(getStorageProvider().backupsPath, 'objects'));
  await assert.rejects(startKnowledgeImport({ ...input, clientId: randomUUID() }, profile('editor')), { code: 'KNOWLEDGE_IMPORT_LIMIT' });
  assert.deepEqual(await fs.readdir(path.join(getStorageProvider().backupsPath, 'objects')), objectsBeforeLimit);
  await assert.rejects(prepareKnowledgeImport(jobs[0].id, profile('other')), { code: 'KNOWLEDGE_IMPORT_NOT_FOUND' });
  await assert.rejects(prepareKnowledgeImport(jobs[0].id, profile('viewer')), { code: 'WORKSPACE_FORBIDDEN' });
  const listed = await readKnowledgeImports(profile('editor'));
  assert.equal(listed.length, 3);
  assert.equal(JSON.stringify(listed).includes('sha256'), false);
  const canceled = await controlKnowledgeImport(jobs[0].id, 'canceled', profile('editor'));
  assert.equal(canceled.backupProgress, undefined);
  assert.equal((await prepareKnowledgeImport(jobs[0].id, profile('editor'))).state, 'canceled');
});
