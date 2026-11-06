import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getStorageProvider, resetStorageProvider } from '../../src/server/storage/index.js';
import {
  getWorkspaceDatabase,
  resetWorkspaceStore,
  createEmptyDatabase,
  listWorkspaceBackups,
  createWorkspaceBackup,
  restoreWorkspaceBackup,
} from '../../src/server/workspace-store.js';
import { getWorkspaceDocument, replaceWorkspaceDocument } from '../../src/server/workspace-document-store.js';
import { stageKnowledgeBodyWindow, loadKnowledgeBody } from '../../src/server/knowledge-body-store.js';
import { readKnowledgeNote, patchKnowledgeNote } from '../../src/server/knowledge-note-store.js';
import { getKnowledgeVersion } from '../../src/server/knowledge-versions.js';
import { bindWikiReferences } from '../../src/shared/knowledge-links.js';
import { app } from '../../src/server/app.js';
import { readKnowledgeCatalog, knowledgeCoreCatalog, restoreKnowledgeTrashReferences } from '../../src/server/knowledge-catalog.js';
import { replaceKnowledgeCatalog } from '../../src/server/knowledge-catalog-write.js';
import { updateKnowledgeTrash } from '../../src/server/knowledge-trash.js';
import { readKnowledgeMigration, startKnowledgeMigration, stepKnowledgeMigration } from '../../src/server/knowledge-migration.js';

let directory, source, storage;
const oldPath = process.env.DATABASE_PATH;
const oldGate = process.env.KNOWLEDGE_CATALOG_ENABLED;
const profile = id => ({ id, email: `${id}@example.test`, role: 'editor' });
test.beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'smena-note-patch-'));
  process.env.DATABASE_PATH = path.join(directory, 'workspace.json');
  process.env.KNOWLEDGE_CATALOG_ENABLED = 'true';
  resetWorkspaceStore();
  resetStorageProvider();
  storage = getStorageProvider();
  source = {
    ...createEmptyDatabase(),
    _aggregateVersion: 1,
    _documentRevisions: { knowledge: { revision: 0 }, bookmarks: { revision: 0 } },
    members: ['owner', 'editor', 'viewer', 'removed'].map(id => ({
      id,
      email: `${id}@example.test`,
      name: id,
      role: id === 'owner' ? 'Owner' : id === 'viewer' ? 'Guest' : 'Member',
      status: id === 'removed' ? 'removed' : 'active',
    })),
    me: 'owner',
    knowledgeNotes: [
      { id: 'a', title: 'First', formatted_markdown: '[[Other]]\n' + 'a'.repeat(100 * 1024), updatedBy: 'owner' },
      { id: 'b', title: 'Other', formatted_markdown: '[[First]]\n' + 'b'.repeat(1024 * 1024), updatedBy: 'owner' },
    ],
  };
  bindWikiReferences(source.knowledgeNotes);
  await storage.saveDatabase(await stageKnowledgeBodyWindow(source, storage, ['a', 'b']));
});
test.afterEach(async () => {
  resetWorkspaceStore();
  resetStorageProvider();
  if (oldPath === undefined) delete process.env.DATABASE_PATH;
  else process.env.DATABASE_PATH = oldPath;
  if (oldGate === undefined) delete process.env.KNOWLEDGE_CATALOG_ENABLED;
  else process.env.KNOWLEDGE_CATALOG_ENABLED = oldGate;
  const resolved = path.resolve(directory);
  assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith('smena-note-patch-'));
  await fs.rm(resolved, { recursive: true, force: true });
});

test('selected note reads/writes retain every other body pointer and wiki binding without reading those bodies', async () => {
  const root = await getWorkspaceDatabase();
  const other = structuredClone(root.knowledgeNotes[1]);
  const reads = [];
  const read = storage.readKnowledgeBody.bind(storage);
  storage.readKnowledgeBody = async hash => {
    reads.push(hash);
    return read(hash);
  };
  const loaded = await readKnowledgeNote('a', profile('editor'));
  assert.equal(loaded.note.formatted_markdown, source.knowledgeNotes[0].formatted_markdown);
  const saved = await patchKnowledgeNote('a', { title: 'After' }, loaded.noteHash, profile('editor'));
  assert.equal(saved.note.title, 'After');
  assert.equal(saved.note.updatedBy, 'editor');
  assert.equal(saved.note.history.length, 1);
  assert.equal(reads.filter(hash => hash === other.bodyRef.sha256).length, 0);
  const current = await getWorkspaceDatabase();
  assert.deepEqual(current.knowledgeNotes[1], other);
  assert.deepEqual(current.knowledgeNotes[0].wikiRefs, source.knowledgeNotes[0].wikiRefs);
  assert.equal(current.knowledgeNotes[0].formatted_markdown, undefined);
  const historical = await getKnowledgeVersion(current, storage, 'a', saved.note.history[0].id);
  assert.equal(historical.version.formatted_markdown, source.knowledgeNotes[0].formatted_markdown);
  assert.equal(historical.noteHash, saved.noteHash);
  const legacy = await getWorkspaceDocument('knowledge');
  assert.equal(legacy.knowledgeNotes[1].formatted_markdown, source.knowledgeNotes[1].formatted_markdown);
  assert.equal(legacy.knowledgeNotes[1].bodyRef, undefined);
  await assert.rejects(replaceWorkspaceDocument('knowledge', legacy, legacy.revision), { code: 'KNOWLEDGE_NOTE_WRITE_REQUIRED' });
});

test('cold knowledge catalog exposes metadata without reading any current or historical body', async () => {
  storage.readKnowledgeBody = async () => {
    throw new Error('Catalog must not load bodies');
  };
  storage.readKnowledgeVersion = async () => {
    throw new Error('Catalog must not load versions');
  };
  const catalog = await readKnowledgeCatalog(profile('editor'));
  assert.equal(catalog.knowledgeNotes.length, 2);
  for (const note of catalog.knowledgeNotes) {
    assert.equal(note.formatted_markdown, undefined);
    assert.equal(note.bodyRef, undefined);
    assert.equal(note.bodyPending, true);
    assert.match(note.bodyToken, /^[a-f0-9]{64}$/);
  }
  await assert.rejects(readKnowledgeCatalog(profile('removed')), { statusCode: 403 });
});

test('catalog folder writes load no bodies and a rename loads only the changed note', async () => {
  const reads = [],
    read = storage.readKnowledgeBody.bind(storage);
  storage.readKnowledgeBody = async hash => {
    reads.push(hash);
    return read(hash);
  };
  let catalog = await readKnowledgeCatalog(profile('editor'));
  catalog.knowledgeFolders.push({ id: 'folder', name: 'Folder' });
  catalog = await replaceKnowledgeCatalog(catalog, catalog.revision, profile('editor'));
  assert.deepEqual(reads, []);
  const second = (await getWorkspaceDatabase()).knowledgeNotes[1];
  catalog.knowledgeNotes[0].title = 'Renamed';
  catalog = await replaceKnowledgeCatalog(catalog, catalog.revision, profile('editor'));
  assert.equal(catalog.knowledgeNotes[0].title, 'Renamed');
  assert.equal(reads.includes(second.bodyRef.sha256), false);
  assert.equal((await readKnowledgeNote('a', profile('editor'))).note.formatted_markdown, source.knowledgeNotes[0].formatted_markdown);
  const revision = catalog.revision;
  assert.equal((await replaceKnowledgeCatalog(catalog, revision, profile('editor'))).revision, revision);
});

test('metadata protocol rejects stale/forged/missing bodies and viewer writes without changing canonical content', async () => {
  const catalog = await readKnowledgeCatalog(profile('editor'));
  const root = structuredClone(await getWorkspaceDatabase());
  for (const mutate of [n => (n.bodyToken = '0'.repeat(64)), n => delete n.bodyToken, n => (n.bodyRef = root.knowledgeNotes[1].bodyRef)]) {
    const input = structuredClone(catalog);
    mutate(input.knowledgeNotes[0]);
    await assert.rejects(replaceKnowledgeCatalog(input, input.revision, profile('editor')));
  }
  const input = structuredClone(catalog);
  input.knowledgeNotes.push({ id: 'empty', title: 'Missing body' });
  await assert.rejects(replaceKnowledgeCatalog(input, input.revision, profile('editor')), { code: 'KNOWLEDGE_BODY_REQUIRED' });
  await assert.rejects(replaceKnowledgeCatalog(catalog, catalog.revision, profile('viewer')), { statusCode: 403 });
  assert.deepEqual(await getWorkspaceDatabase(), root);
});

test('note trash and restore publish membership and immutable body references atomically', async () => {
  const root = await getWorkspaceDatabase(),
    other = structuredClone(root.knowledgeNotes[1]);
  await updateKnowledgeTrash('trash', ['a'], 0, profile('editor'));
  let current = await getWorkspaceDatabase();
  assert.equal(
    current.knowledgeNotes.some(note => note.id === 'a'),
    false,
  );
  const item = current.trash.find(item => item.kind === 'note');
  assert.ok(item.data.note.bodyRef);
  assert.equal(item.data.note.formatted_markdown, undefined);
  const projected = knowledgeCoreCatalog(current);
  assert.equal(projected.trash[0].data.note.bodyRef, undefined);
  const echoed = restoreKnowledgeTrashReferences(current, projected);
  assert.deepEqual(echoed.trash[0].data.note, item.data.note);
  projected.trash[0].data.note.bodyToken = '0'.repeat(64);
  assert.throws(() => restoreKnowledgeTrashReferences(current, projected), { code: 'KNOWLEDGE_BODY_STALE' });
  assert.deepEqual(current.knowledgeNotes[0], other);
  await assert.rejects(updateKnowledgeTrash('restore', item.id, 1, profile('viewer')), { statusCode: 403 });
  await assert.rejects(updateKnowledgeTrash('restore', item.id, 1, profile('owner')), { statusCode: 404 });
  await updateKnowledgeTrash('restore', item.id, 1, profile('editor'));
  current = await getWorkspaceDatabase();
  assert.equal(current.trash.length, 0);
  assert.equal((await readKnowledgeNote('a', profile('editor'))).note.formatted_markdown, source.knowledgeNotes[0].formatted_markdown);
});

test('reviewed migration backs up once, pauses, resumes bounded windows and restores a standalone copy', async () => {
  const root = await getWorkspaceDatabase();
  for (let i = 0; i < 7; i++)
    root.knowledgeNotes.push({ id: 'legacy-' + i, title: 'Legacy ' + i, formatted_markdown: 'Source ' + i + ' ' + '.'.repeat(50000) });
  root.trash.push({
    id: 'legacy-trash',
    kind: 'note',
    deletedBy: 'owner',
    deletedAt: Date.now(),
    data: { note: { id: 'trashed-note', title: 'Trash', formatted_markdown: 'Trashed source' } },
  });
  await storage.saveDatabase(root);
  resetWorkspaceStore();
  await assert.rejects(readKnowledgeMigration(profile('editor')), { statusCode: 403 });
  let plan = await readKnowledgeMigration(profile('owner'));
  assert.equal(plan.remaining, 8);
  await assert.rejects(startKnowledgeMigration('bad-review', profile('owner')), { code: 'KNOWLEDGE_MIGRATION_REVIEW_STALE' });
  plan = await startKnowledgeMigration(plan.reviewKey, profile('owner'));
  assert.ok(plan.job.backupId);
  assert.equal((await listWorkspaceBackups()).length, 1);
  plan = await stepKnowledgeMigration(plan.job.id, profile('owner'));
  assert.equal(plan.job.processed, 3);
  assert.equal(plan.remaining, 5);
  plan = await stepKnowledgeMigration(plan.job.id, profile('owner'), [], { pause: true });
  assert.equal(plan.job.state, 'paused');
  while (plan.remaining) plan = await stepKnowledgeMigration(plan.job.id, profile('owner'));
  assert.equal(plan.job.state, 'complete');
  assert.equal(plan.job.processed, 8);
  const current = await getWorkspaceDatabase();
  assert.equal(current.trash[0].data.note.formatted_markdown, undefined);
  const after = await stepKnowledgeMigration(plan.job.id, profile('owner'));
  assert.equal(after.revision, current.revision);
  const backup = await createWorkspaceBackup('After split');
  const standalone = await storage.loadDatabaseBackup(backup.id);
  assert.equal(
    standalone.knowledgeNotes.find(n => n.id === 'legacy-6').formatted_markdown,
    root.knowledgeNotes.find(n => n.id === 'legacy-6').formatted_markdown,
  );
  await restoreWorkspaceBackup(backup.id, current.revision);
  const restored = await getWorkspaceDatabase();
  assert.ok(restored.knowledgeNotes.every(n => n.bodyRef));
  assert.equal(
    (await readKnowledgeNote('legacy-6', profile('owner'))).note.formatted_markdown,
    root.knowledgeNotes.find(n => n.id === 'legacy-6').formatted_markdown,
  );
});

test('a failed migration window never publishes partial references and resumes without lost notes', async () => {
  const root = await getWorkspaceDatabase();
  root.knowledgeNotes.push(...['x', 'y', 'z'].map(id => ({ id, title: id, formatted_markdown: id.repeat(1000) })));
  await storage.saveDatabase(root);
  resetWorkspaceStore();
  let plan = await readKnowledgeMigration(profile('owner'));
  plan = await startKnowledgeMigration(plan.reviewKey, profile('owner'));
  const before = await getWorkspaceDatabase(),
    write = storage.writeKnowledgeBody.bind(storage);
  let calls = 0;
  storage.writeKnowledgeBody = async (...args) => {
    if (++calls === 2) throw new Error('Provider interrupted');
    return write(...args);
  };
  await assert.rejects(stepKnowledgeMigration(plan.job.id, profile('owner')), /Provider interrupted/);
  assert.deepEqual(await getWorkspaceDatabase(), before);
  storage.writeKnowledgeBody = write;
  plan = await stepKnowledgeMigration(plan.job.id, profile('owner'));
  assert.equal(plan.remaining, 0);
  assert.equal(plan.job.processed, 3);
});

test('empty/matching note patches preserve dates, history and all revisions', async () => {
  const loaded = await readKnowledgeNote('a', profile('editor'));
  const root = await getWorkspaceDatabase();
  for (const patch of [{}, { title: loaded.note.title }]) {
    const result = await patchKnowledgeNote('a', patch, loaded.noteHash, profile('editor'));
    assert.deepEqual(result.note, loaded.note);
    assert.equal(result.revision, loaded.revision);
    assert.deepEqual(await getWorkspaceDatabase(), root);
  }
});

test('concurrent different-note patches retry root conflicts; same-note stale writes never overwrite', async () => {
  const a = await readKnowledgeNote('a', profile('editor')),
    b = await readKnowledgeNote('b', profile('owner'));
  await Promise.all([
    patchKnowledgeNote('a', { title: 'Changed A' }, a.noteHash, profile('editor')),
    patchKnowledgeNote('b', { title: 'Changed B' }, b.noteHash, profile('owner')),
  ]);
  assert.deepEqual(
    (await getWorkspaceDatabase()).knowledgeNotes.map(note => note.title),
    ['Changed A', 'Changed B'],
  );
  const fresh = await readKnowledgeNote('a', profile('editor'));
  const results = await Promise.allSettled([
    patchKnowledgeNote('a', { title: 'Winner one' }, fresh.noteHash, profile('editor')),
    patchKnowledgeNote('a', { title: 'Winner two' }, fresh.noteHash, profile('owner')),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'KNOWLEDGE_VERSION_STALE');
});

test('canonical membership is checked again; forged pointers and server-owned fields are not patchable', async () => {
  const loaded = await readKnowledgeNote('a', profile('editor'));
  for (const id of ['viewer', 'removed', 'absent'])
    await assert.rejects(patchKnowledgeNote('a', { title: 'Unauthorized' }, loaded.noteHash, profile(id)), { statusCode: 403 });
  assert.equal((await readKnowledgeNote('a', profile('viewer'))).note.title, 'First');
  await assert.rejects(readKnowledgeNote('a', profile('removed')), { statusCode: 403 });
  for (const patch of [
    { bodyRef: { sha256: 'a'.repeat(64) } },
    { updatedBy: 'owner' },
    { history: [] },
    { id: 'another' },
    { formatted_markdown: null },
    { favorite: 'yes' },
  ])
    await assert.rejects(patchKnowledgeNote('a', patch, loaded.noteHash, profile('editor')), { code: 'INVALID_NOTE_PATCH' });
  const root = await getWorkspaceDatabase();
  assert.equal((await loadKnowledgeBody(storage, root.knowledgeNotes[0])).title, 'First');
});

test('authenticated note endpoints read only the requested note and enforce viewer denial and stale hashes', async t => {
  const keys = ['SESSION_SECRET', 'ACCESS_ID_LOGIN_ENABLED', 'ACCESS_IDS_JSON'];
  const original = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  process.env.SESSION_SECRET = 'isolated-note-route-secret-at-least-thirty-two-chars';
  process.env.ACCESS_ID_LOGIN_ENABLED = 'true';
  process.env.ACCESS_IDS_JSON = JSON.stringify(
    ['editor', 'viewer'].map(id => ({ ...profile(id), name: id, active: true, role: id === 'viewer' ? 'viewer' : 'editor', accessId: `local-test-${id}` })),
  );
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    for (const key of keys)
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const login = async id => {
    const response = await fetch(`${origin}/api/auth/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessId: `local-test-${id}` }),
    });
    assert.equal(response.status, 200);
    return { Authorization: `Bearer ${(await response.json()).token}`, 'Content-Type': 'application/json' };
  };
  assert.equal((await fetch(`${origin}/api/knowledge/notes/a`)).status, 401);
  const editor = await login('editor'),
    viewer = await login('viewer');
  const response = await fetch(`${origin}/api/knowledge/notes/a`, { headers: editor });
  assert.equal(response.status, 200);
  const loaded = await response.json();
  assert.equal(loaded.note.formatted_markdown, source.knowledgeNotes[0].formatted_markdown);
  assert.equal(loaded.note.bodyRef, undefined);
  const patch = headers =>
    fetch(`${origin}/api/knowledge/notes/a`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ noteHash: loaded.noteHash, patch: { title: 'HTTP edited' } }),
    });
  assert.equal((await patch(viewer)).status, 403);
  assert.equal((await patch(editor)).status, 200);
  assert.equal((await patch(editor)).status, 409);
  assert.equal((await fetch(`${origin}/api/knowledge/notes/missing`, { headers: editor })).status, 404);
});
