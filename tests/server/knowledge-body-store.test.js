import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { LocalStorageProvider } from '../../src/server/storage/local-storage.js';
import { GoogleDriveStorageProvider } from '../../src/server/storage/google-drive.js';
import { KNOWLEDGE_BODY_MAX_BYTES, knowledgeBodyMigrationWindow, validKnowledgeBodyRef } from '../../src/shared/knowledge-body.js';
import { storeKnowledgeBody, loadKnowledgeBody, stageKnowledgeBodyWindow, expandKnowledgeBodies } from '../../src/server/knowledge-body-store.js';
import { persistKnowledgeVersion } from '../../src/server/knowledge-version-blobs.js';
import { knowledgeCatalogNote } from '../../src/server/knowledge-catalog.js';
import { noteCardExcerpt } from '../../src/shared/knowledge-search.js';

test('cold catalog previews stay bounded, omit MD service fields and preserve literal TXT without body reads', async () => {
  const storage = memoryStorage();
  for (const sourceFormat of ['markdown', 'text']) {
    const note = { id: 'p', title: 'Preview', sourceFormat, formatted_markdown: '---\nsecret_marker: service\n---\nReadable content ' + 'word '.repeat(90) };
    const stored = await storeKnowledgeBody(storage, note);
    const catalog = knowledgeCatalogNote(stored);
    const excerpt = noteCardExcerpt(catalog, '');
    assert.ok(excerpt.length > 0 && excerpt.length <= 180);
    assert.equal(excerpt.includes('secret_marker'), sourceFormat === 'text');
    assert.equal(storage.reads.length, sourceFormat === 'text' ? 1 : 0);
    assert.equal(Object.hasOwn(catalog, 'formatted_markdown'), false);
    assert.deepEqual(await loadKnowledgeBody(storage, stored), note);
  }
});

function memoryStorage() {
  const objects = new Map(),
    reads = [],
    writes = [];
  return {
    objects,
    reads,
    writes,
    writeKnowledgeBody: async (text, hash) => {
      writes.push(hash);
      objects.set(hash, text);
    },
    readKnowledgeBody: async hash => {
      reads.push(hash);
      return objects.get(hash);
    },
  };
}

test('migration windows stage real-sized note bodies without reading or replacing other catalogs', async () => {
  const storage = memoryStorage();
  const source = {
    revision: 8,
    knowledgeNotes: Array.from({ length: 81 }, (_, i) => ({
      id: `n${String(i).padStart(3, '0')}`,
      title: `Note ${i}`,
      folderId: 'folder',
      formatted_markdown: '# Content\n' + 'я'.repeat(i === 80 ? 512 * 1024 : 50 * 1024),
      wikiRefs: { target: 'n080' },
      blockIds: ['stable-block'],
      history: [{ id: 'v', contentRef: { kind: 'knowledge-version-v1', sha256: 'a'.repeat(64), bytes: 200 } }],
    })),
    knowledgeFolders: [{ id: 'folder', name: 'Папка / Folder' }],
    files: [{ id: 'untouched-file' }],
  };
  assert.ok(Buffer.byteLength(JSON.stringify(source)) > 8 * 1024 * 1024);
  let staged = source;
  for (;;) {
    const window = knowledgeBodyMigrationWindow(staged.knowledgeNotes, { limit: 20 });
    if (!window.ids.length) break;
    const previous = staged;
    staged = await stageKnowledgeBodyWindow(staged, storage, window.ids);
    assert.equal(staged.files, source.files);
    assert.equal(staged.knowledgeFolders, source.knowledgeFolders);
    assert.ok(previous.knowledgeNotes.every(note => typeof note.formatted_markdown === 'string' || validKnowledgeBodyRef(note.bodyRef)));
  }
  assert.equal(storage.reads.length, 0);
  assert.equal(storage.writes.length, 81);
  assert.ok(Buffer.byteLength(JSON.stringify(staged)) < 100 * 1024);
  const selected = await expandKnowledgeBodies(staged, storage, { ids: ['n080'] });
  assert.equal(storage.reads.length, 1);
  assert.equal(selected.knowledgeNotes[80].formatted_markdown, source.knowledgeNotes[80].formatted_markdown);
  assert.equal(selected.knowledgeNotes[0], staged.knowledgeNotes[0]);
  const standalone = await expandKnowledgeBodies(staged, storage);
  assert.deepEqual(standalone, source);
  assert.equal(standalone.files, source.files);
});

test('body integrity binds exact bytes, canonical note identity and format; no arbitrary provider ID is accepted', async () => {
  const storage = memoryStorage();
  const original = { id: 'private-note', title: 'Body', formatted_markdown: '    source\n\n' };
  const compact = await storeKnowledgeBody(storage, original);
  assert.deepEqual(await loadKnowledgeBody(storage, compact), original);
  await assert.rejects(loadKnowledgeBody(storage, { ...compact, id: 'another-note' }), { code: 'KNOWLEDGE_BODY_INTEGRITY' });
  for (const change of [{ sha256: '../other' }, { bytes: -1 }, { bytes: KNOWLEDGE_BODY_MAX_BYTES + 1 }])
    await assert.rejects(loadKnowledgeBody(storage, { ...compact, bodyRef: { ...compact.bodyRef, ...change } }), { code: 'KNOWLEDGE_BODY_INTEGRITY' });
  storage.objects.set(compact.bodyRef.sha256, storage.objects.get(compact.bodyRef.sha256) + ' ');
  await assert.rejects(loadKnowledgeBody(storage, compact), { code: 'KNOWLEDGE_BODY_INTEGRITY' });
  const badFormat = JSON.stringify({ format: 'unknown', noteId: original.id, formatted_markdown: 'x' });
  const hash = createHash('sha256').update(badFormat).digest('hex');
  storage.objects.set(hash, badFormat);
  await assert.rejects(loadKnowledgeBody(storage, { ...compact, bodyRef: { ...compact.bodyRef, sha256: hash, bytes: Buffer.byteLength(badFormat) } }), {
    code: 'KNOWLEDGE_BODY_INTEGRITY',
  });
});

test('migration order is stable, bounded and resumable; oversized objects fail before provider writes', async () => {
  const notes = [{ id: 'z' }, { id: 'b' }, { id: 'a' }, { id: 'c' }];
  assert.deepEqual(knowledgeBodyMigrationWindow(notes, { limit: 2 }), { ids: ['a', 'b'], remaining: 4, next: 'b' });
  assert.deepEqual(knowledgeBodyMigrationWindow(notes, { after: 'b', limit: 2 }), { ids: ['c', 'z'], remaining: 2, next: null });
  assert.equal(
    knowledgeBodyMigrationWindow(
      Array.from({ length: 40 }, (_, i) => ({ id: String(i) })),
      { limit: 999 },
    ).ids.length,
    20,
  );
  const storage = memoryStorage();
  await assert.rejects(storeKnowledgeBody(storage, { id: 'big', formatted_markdown: 'x'.repeat(KNOWLEDGE_BODY_MAX_BYTES) }), {
    code: 'KNOWLEDGE_BODY_LIMIT',
    statusCode: 413,
  });
  assert.equal(storage.writes.length, 0);
});

test('abort, missing identities and provider failures leave the source migration snapshot untouched', async () => {
  const data = {
    knowledgeNotes: [
      { id: 'a', formatted_markdown: 'first' },
      { id: 'b', formatted_markdown: 'second' },
    ],
  };
  const original = structuredClone(data);
  const storage = memoryStorage();
  await assert.rejects(stageKnowledgeBodyWindow(data, storage, ['a', 'absent']), { code: 'KNOWLEDGE_NOT_FOUND' });
  assert.equal(storage.writes.length, 0);
  const controller = new AbortController();
  storage.writeKnowledgeBody = async () => controller.abort();
  await assert.rejects(stageKnowledgeBodyWindow(data, storage, ['a', 'b'], { signal: controller.signal }), { name: 'AbortError' });
  storage.writeKnowledgeBody = async () => {
    throw new Error('Provider unavailable');
  };
  await assert.rejects(stageKnowledgeBodyWindow(data, storage, ['a']), /Provider unavailable/);
  assert.deepEqual(data, original);
  await assert.rejects(stageKnowledgeBodyWindow(data, storage, Array(21).fill('a')), /Invalid/);
});

test('standalone expansion includes note Trash but preserves file records and unrelated notes', async () => {
  const storage = memoryStorage();
  const note = { id: 'a', formatted_markdown: 'trash original' };
  const compact = await storeKnowledgeBody(storage, note);
  const source = {
    knowledgeNotes: [],
    files: [{ id: 'original' }],
    trash: [
      { kind: 'note', data: { note: compact } },
      { kind: 'file', data: { id: 'file' } },
    ],
  };
  const expanded = await expandKnowledgeBodies(source, storage);
  assert.deepEqual(expanded.trash[0].data.note, note);
  assert.equal(expanded.trash[1], source.trash[1]);
  assert.equal(expanded.files, source.files);
  assert.deepEqual(source.trash[0].data.note, compact);
});

test('Local immutable bodies publish atomically, isolate workspace directories and reject traversal', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'smena-note-bodies-'));
  try {
    const storage = new LocalStorageProvider(path.join(directory, 'a', 'workspace.json'));
    const note = { id: 'n', title: 'Exact', formatted_markdown: '    я\n'.repeat(1000) };
    const references = await Promise.all(Array.from({ length: 8 }, () => storeKnowledgeBody(storage, note)));
    assert.ok(references.every(ref => ref.bodyRef.sha256 === references[0].bodyRef.sha256));
    assert.deepEqual(await loadKnowledgeBody(storage, references[0]), note);
    assert.equal((await fs.readdir(path.join(directory, 'a', 'knowledge-bodies'))).length, 1);
    const other = new LocalStorageProvider(path.join(directory, 'b', 'workspace.json'));
    await assert.rejects(other.readKnowledgeBody(references[0].bodyRef.sha256), { code: 'ENOENT' });
    await assert.rejects(storage.readKnowledgeBody('../outside'), { code: 'KNOWLEDGE_BODY_INTEGRITY' });
    await assert.rejects(storage.writeKnowledgeBody('mismatch', references[0].bodyRef.sha256), { code: 'KNOWLEDGE_BODY_INTEGRITY' });
    assert.deepEqual(await loadKnowledgeBody(storage, references[0]), note);
  } finally {
    const resolved = path.resolve(directory);
    assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith('smena-note-bodies-'));
    await fs.rm(resolved, { recursive: true, force: true });
  }
});

test('Drive bodies require the current workspace parent, exact application marker and unique identity', async () => {
  const storage = new GoogleDriveStorageProvider();
  storage.rootFolderId = 'current-workspace';
  storage.init = async () => {};
  const queries = [],
    writes = [];
  storage.client = {
    files: {
      list: async args => {
        queries.push(args);
        return { data: { files: [] } };
      },
      create: async args => {
        writes.push(args);
        return { data: { id: 'object' } };
      },
    },
  };
  const compact = await storeKnowledgeBody(storage, { id: 'n', formatted_markdown: 'Body' });
  assert.match(queries[0].q, /'current-workspace' in parents/);
  assert.match(queries[0].q, /smenaKnowledgeBody/);
  assert.equal(writes[0].requestBody.appProperties.smenaKnowledgeBody, '1');
  assert.match(writes[0].requestBody.name, /^smena-knowledge-body-[a-f0-9]{64}\.json$/);
  await assert.rejects(loadKnowledgeBody(storage, compact), { code: 'KNOWLEDGE_BODY_INTEGRITY' });
  storage.client.files.list = async () => ({ data: { files: [{ id: 'one' }, { id: 'two' }] } });
  await assert.rejects(storage.readKnowledgeBody(compact.bodyRef.sha256), { code: 'DRIVE_STORAGE_AMBIGUOUS' });
});

test('Local backup embeds current bodies and historical versions including Trash, without depending on immutable objects', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'smena-body-backup-'));
  try {
    const storage = new LocalStorageProvider(path.join(directory, 'workspace.json'));
    const version = await persistKnowledgeVersion(storage, 'n', { id: 'v', title: 'Old', formatted_markdown: 'old body\n' });
    const compact = await storeKnowledgeBody(storage, { id: 'n', title: 'Current', formatted_markdown: '    current\n\n', history: [version] });
    const backup = await storage.createDatabaseBackup(
      { knowledgeNotes: [compact], files: [], trash: [{ kind: 'note', data: { note: compact } }] },
      'Standalone bodies',
    );
    // Only temporary test objects are removed. The backup itself must contain
    // its own bytes rather than relying on those objects remaining available.
    await fs.unlink(storage.knowledgeBodyPath(compact.bodyRef.sha256));
    await fs.unlink(storage.knowledgeVersionPath(version.contentRef.sha256));
    const data = await storage.loadDatabaseBackup(backup.id);
    for (const note of [data.knowledgeNotes[0], data.trash[0].data.note]) {
      assert.equal(note.formatted_markdown, '    current\n\n');
      assert.equal(note.history[0].formatted_markdown, 'old body\n');
      assert.equal(note.bodyRef, undefined);
      assert.equal(note.history[0].contentRef, undefined);
    }
  } finally {
    const resolved = path.resolve(directory);
    assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith('smena-body-backup-'));
    await fs.rm(resolved, { recursive: true, force: true });
  }
});

test('Drive backup stream expands selected body refs and still streams file records without fetching that catalog', async () => {
  const objects = memoryStorage();
  const compact = await storeKnowledgeBody(objects, { id: 'n', title: 'Portable', formatted_markdown: 'body\n' });
  const storage = new GoogleDriveStorageProvider();
  storage.readKnowledgeBody = objects.readKnowledgeBody;
  storage.ensureBackupsFolder = async () => 'backups';
  let uploaded;
  storage.client = {
    files: {
      create: async args => {
        let text = '';
        for await (const chunk of args.media.body) text += chunk.toString();
        uploaded = JSON.parse(text);
        return { data: { id: 'backup' } };
      },
    },
  };
  function* records() {
    yield JSON.stringify({ id: 'streamed-file' });
  }
  await storage.uploadDatabaseBackup({ knowledgeNotes: [compact], files: [] }, 'Body backup', records());
  assert.equal(objects.reads.length, 1);
  assert.equal(uploaded.data.knowledgeNotes[0].formatted_markdown, 'body\n');
  assert.equal(uploaded.data.knowledgeNotes[0].bodyRef, undefined);
  assert.deepEqual(uploaded.data.files, [{ id: 'streamed-file' }]);
});
