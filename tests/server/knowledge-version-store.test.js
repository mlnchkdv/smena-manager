import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getWorkspaceDocument, replaceWorkspaceDocument } from '../../src/server/workspace-document-store.js';
import { getWorkspaceDatabase, resetWorkspaceStore, createWorkspaceBackup, restoreWorkspaceBackup } from '../../src/server/workspace-store.js';
import { getStorageProvider, resetStorageProvider } from '../../src/server/storage/index.js';
import { getKnowledgeVersion, knowledgeSnapshotHash, knowledgeVersionPage } from '../../src/server/knowledge-versions.js';

let directory;
const original = process.env.DATABASE_PATH;
test.beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'smena-version-store-'));
  process.env.DATABASE_PATH = path.join(directory, 'workspace.json');
  resetStorageProvider();
  resetWorkspaceStore();
});
test.afterEach(async () => {
  resetStorageProvider();
  resetWorkspaceStore();
  if (original === undefined) delete process.env.DATABASE_PATH;
  else process.env.DATABASE_PATH = original;
  assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(directory).startsWith('smena-version-store-'));
  await fs.rm(directory, { recursive: true, force: true });
});

test('large note save, reviewed restore, checkpoint and standalone workspace restore preserve exact bytes', async () => {
  for (const length of [100 * 1024, 1024 * 1024]) {
    let document = await getWorkspaceDocument('knowledge');
    const text = '# Текст / Text\n' + 'я'.repeat(length);
    document = await replaceWorkspaceDocument(
      'knowledge',
      { knowledgeNotes: [{ id: `n-${length}`, title: 'Before', formatted_markdown: text, updatedBy: 'a' }], knowledgeFolders: [] },
      document.revision,
    );
    document = await replaceWorkspaceDocument(
      'knowledge',
      { ...document, knowledgeNotes: [{ ...document.knowledgeNotes[0], title: 'After', formatted_markdown: text + '\nChanged', updatedBy: 'b' }] },
      document.revision,
    );
    const edited = document.knowledgeNotes[0];
    assert.equal(edited.history.length, 1);
    assert.ok(JSON.stringify(edited.history).length < 2000);
    const database = await getWorkspaceDatabase();
    assert.equal(knowledgeVersionPage(database, edited.id).total, 1);
    const selected = await getKnowledgeVersion(database, getStorageProvider(), edited.id, edited.history[0].id);
    assert.equal(selected.version.formatted_markdown, text);
    const backup = await createWorkspaceBackup('Standalone large history');
    document = await replaceWorkspaceDocument(
      'knowledge',
      { ...document, knowledgeNotes: [{ ...edited, restoreFromVersion: selected.version.id, restoreExpectedHash: selected.noteHash }] },
      document.revision,
    );
    assert.equal(document.knowledgeNotes[0].formatted_markdown, text);
    assert.equal(document.knowledgeNotes[0].title, 'Before');
    const checkpoint = await getKnowledgeVersion(await getWorkspaceDatabase(), getStorageProvider(), edited.id, document.knowledgeNotes[0].history[0].id);
    assert.equal(checkpoint.version.formatted_markdown, text + '\nChanged');
    const current = await getWorkspaceDatabase();
    await restoreWorkspaceBackup(backup.id, current.revision);
    const restored = await getWorkspaceDocument('knowledge');
    assert.equal(restored.knowledgeNotes[0].formatted_markdown, text + '\nChanged');
    const restoredVersion = await getKnowledgeVersion(await getWorkspaceDatabase(), getStorageProvider(), edited.id, restored.knowledgeNotes[0].history[0].id);
    assert.equal(restoredVersion.version.formatted_markdown, text);
  }
});

test('stale reviewed restore and failed version write do not overwrite canonical note content', async () => {
  let document = await getWorkspaceDocument('knowledge');
  document = await replaceWorkspaceDocument(
    'knowledge',
    { knowledgeNotes: [{ id: 'n', title: 'Original', formatted_markdown: 'body' }], knowledgeFolders: [] },
    document.revision,
  );
  document = await replaceWorkspaceDocument(
    'knowledge',
    { ...document, knowledgeNotes: [{ ...document.knowledgeNotes[0], title: 'Edited', updatedBy: 'b' }] },
    document.revision,
  );
  const originalHash = knowledgeSnapshotHash(document.knowledgeNotes[0]);
  const version = document.knowledgeNotes[0].history[0].id;
  document = await replaceWorkspaceDocument(
    'knowledge',
    { ...document, knowledgeNotes: [{ ...document.knowledgeNotes[0], title: 'Concurrent change' }] },
    document.revision,
  );
  await assert.rejects(
    replaceWorkspaceDocument(
      'knowledge',
      { ...document, knowledgeNotes: [{ ...document.knowledgeNotes[0], restoreFromVersion: version, restoreExpectedHash: originalHash }] },
      document.revision,
    ),
    { code: 'KNOWLEDGE_VERSION_STALE' },
  );
  assert.equal((await getWorkspaceDocument('knowledge')).knowledgeNotes[0].title, 'Concurrent change');
  const storage = getStorageProvider();
  storage.writeKnowledgeVersion = async () => {
    throw Object.assign(new Error('History quota exceeded'), { code: 'KNOWLEDGE_VERSION_LIMIT', statusCode: 413 });
  };
  await assert.rejects(
    replaceWorkspaceDocument(
      'knowledge',
      { ...document, knowledgeNotes: [{ ...document.knowledgeNotes[0], title: 'Uncommitted', updatedBy: 'another' }] },
      document.revision,
    ),
    { code: 'KNOWLEDGE_VERSION_LIMIT' },
  );
  assert.equal((await getWorkspaceDocument('knowledge')).knowledgeNotes[0].title, 'Concurrent change');
  await assert.rejects(getKnowledgeVersion(await getWorkspaceDatabase(), storage, 'missing-note', version), { statusCode: 404 });
});

test('history index pages are bounded and cannot address another note by a stored blob identity', () => {
  const data = {
    knowledgeNotes: [
      { id: 'a', history: Array.from({ length: 20 }, (_, i) => ({ id: `v${i}`, title: String(i), contentRef: { sha256: 'private-identity' } })) },
    ],
  };
  const first = knowledgeVersionPage(data, 'a');
  assert.equal(first.total, 20);
  assert.equal(first.versions.length, 5);
  assert.equal(first.versions[0].contentRef, undefined);
  assert.equal(knowledgeVersionPage(data, 'a', 100).offset, 15);
  assert.throws(() => knowledgeVersionPage(data, 'other'), { statusCode: 404 });
});
