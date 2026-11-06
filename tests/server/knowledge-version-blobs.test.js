import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { LocalStorageProvider } from '../../src/server/storage/local-storage.js';
import { GoogleDriveStorageProvider } from '../../src/server/storage/google-drive.js';
import {
  expandKnowledgeVersions,
  externalizeKnowledgeVersions,
  persistKnowledgeVersion,
  readKnowledgeVersion,
  storedNoteHistory,
} from '../../src/server/knowledge-version-blobs.js';

test('100 KiB and 1 MiB notes retain exact immutable versions, migrate inline history, and create standalone backups', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'smena-history-'));
  try {
    const storage = new LocalStorageProvider(path.join(directory, 'workspace.json'));
    for (const length of [100 * 1024, 1024 * 1024]) {
      const before = {
        id: `note-${length}`,
        title: 'Исходник / Source',
        formatted_markdown: 'я'.repeat(length),
        updatedBy: 'a',
        history: [{ id: 'old-inline', title: 'Legacy', formatted_markdown: 'Old text' }],
      };
      const history = await storedNoteHistory(storage, before, { ...before, title: 'Edited', updatedBy: 'b' }, 200000);
      assert.equal(history.length, 2);
      assert.ok(JSON.stringify(history).length < 2000);
      const version = await readKnowledgeVersion(storage, before.id, history[0]);
      assert.equal(version.formatted_markdown, before.formatted_markdown);
      assert.equal((await readKnowledgeVersion(storage, before.id, history[1])).formatted_markdown, 'Old text');
      const data = { knowledgeNotes: [{ ...before, history }], files: [{ id: 'file' }], trash: [{ kind: 'note', data: { note: { ...before, history } } }] };
      const backup = await storage.createDatabaseBackup(data, 'Local version acceptance');
      const embedded = await storage.loadDatabaseBackup(backup.id);
      assert.equal(embedded.knowledgeNotes[0].history[0].formatted_markdown, before.formatted_markdown);
      assert.equal(embedded.trash[0].data.note.history[0].formatted_markdown, before.formatted_markdown);
      const compact = await externalizeKnowledgeVersions(embedded, storage);
      assert.equal(compact.knowledgeNotes[0].history[0].contentRef.kind, 'knowledge-version-v1');
      const expanded = await expandKnowledgeVersions(compact, storage);
      assert.deepEqual(expanded, embedded);
      assert.equal(expanded.files, compact.files, 'file catalog is not cloned or loaded to expand note versions');
    }
  } finally {
    const resolved = path.resolve(directory);
    assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith('smena-history-'));
    await fs.rm(resolved, { recursive: true, force: true });
  }
});

test('immutable versions reject corruption, wrong-note replay and traversal; write failure leaves the live note untouched', async () => {
  const objects = new Map();
  const storage = { writeKnowledgeVersion: async (text, hash) => objects.set(hash, text), readKnowledgeVersion: async hash => objects.get(hash) };
  const version = await persistKnowledgeVersion(storage, 'a', { id: 'v', title: 'Original', formatted_markdown: 'content' });
  await assert.rejects(readKnowledgeVersion(storage, 'b', version), { code: 'KNOWLEDGE_VERSION_INTEGRITY' });
  objects.set(version.contentRef.sha256, 'changed');
  await assert.rejects(readKnowledgeVersion(storage, 'a', version), { code: 'KNOWLEDGE_VERSION_INTEGRITY' });
  await assert.rejects(readKnowledgeVersion(storage, 'a', { ...version, contentRef: { ...version.contentRef, sha256: '../other' } }), {
    code: 'KNOWLEDGE_VERSION_INTEGRITY',
  });
  const before = { id: 'a', title: 'Before', formatted_markdown: 'body' };
  await assert.rejects(
    storedNoteHistory(
      {
        writeKnowledgeVersion: async () => {
          throw new Error('Storage offline');
        },
      },
      before,
      { ...before, title: 'After' },
    ),
  );
  assert.equal(before.history, undefined);
});

test('Drive version lookup is constrained by workspace parent and application marker, never an arbitrary supplied file ID', async () => {
  const storage = new GoogleDriveStorageProvider();
  storage.rootFolderId = 'workspace-root';
  storage.init = async () => {};
  const queries = [],
    writes = [];
  storage.client = {
    files: {
      list: async args => {
        queries.push(args.q);
        return { data: { files: [] } };
      },
      create: async args => {
        writes.push(args);
        return { data: { id: 'immutable-id' } };
      },
    },
  };
  const ref = await persistKnowledgeVersion(storage, 'note', { id: 'v', title: 'A', formatted_markdown: 'Body' });
  assert.match(queries[0], /'workspace-root' in parents/);
  assert.match(queries[0], /smenaKnowledgeVersion/);
  assert.match(writes[0].requestBody.name, /^smena-knowledge-version-[a-f0-9]{64}\.json$/);
  assert.equal(writes[0].requestBody.appProperties.smenaKnowledgeVersion, '1');
  await assert.rejects(readKnowledgeVersion(storage, 'note', ref), { code: 'KNOWLEDGE_VERSION_INTEGRITY' });
});
