import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readKnowledgeCatalogPage } from '../../src/server/knowledge-catalog-pages.js';
import { applyKnowledgeCatalogDelta } from '../../src/server/knowledge-catalog-delta.js';
import { readKnowledgePages, writeKnowledgeDelta } from '../../src/core/knowledge-catalog-transport.js';
import { catalogDelta } from '../../src/shared/knowledge-catalog-delta.js';
import { createEmptyDatabase, resetWorkspaceStore, getWorkspaceDatabase } from '../../src/server/workspace-store.js';
import { resetStorageProvider, getStorageProvider } from '../../src/server/storage/index.js';
import { externalizeKnowledgeBodies } from '../../src/server/knowledge-body-store.js';
import { stageKnowledgeSearch } from '../../src/server/knowledge-search-store.js';
const actor = { id: 'owner', email: 'owner@example.test', role: 'admin' };
test('10,001-note catalog is paged, edited as a small delta, reloaded and isolated from unauthorized actors', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'smena-pages-'));
  const old = {
    DATABASE_PATH: process.env.DATABASE_PATH,
    KNOWLEDGE_CATALOG_ENABLED: process.env.KNOWLEDGE_CATALOG_ENABLED,
    KNOWLEDGE_METADATA_SHARDS_ENABLED: process.env.KNOWLEDGE_METADATA_SHARDS_ENABLED,
  };
  try {
    process.env.DATABASE_PATH = path.join(directory, 'workspace.json');
    process.env.KNOWLEDGE_CATALOG_ENABLED = 'true';
    process.env.KNOWLEDGE_METADATA_SHARDS_ENABLED = 'true';
    resetWorkspaceStore();
    resetStorageProvider();
    const storage = getStorageProvider();
    const source = {
      ...createEmptyDatabase(),
      _aggregateVersion: 1,
      _documentRevisions: { knowledge: { revision: 0 }, bookmarks: { revision: 0 } },
      members: [{ ...actor, role: 'Owner', name: 'Owner' }],
      me: 'owner',
      knowledgeFolders: [{ id: 'folder', name: 'Folder', parentId: null }],
      knowledgeNotes: Array.from({ length: 10001 }, (_, i) => ({
        id: 'note-' + i,
        title: 'Заметка / Note ' + i,
        summary: 'metadata '.repeat(60),
        folderId: 'folder',
        formatted_markdown: 'Text ' + i,
        wikiRefs: [],
        wikilinks: [],
        category: 'general',
      })),
    };
    const staged = await externalizeKnowledgeBodies(source, storage);
    await stageKnowledgeSearch(staged, {}, storage, { reset: true });
    await storage.saveDatabase(staged);
    const raw = JSON.parse(await fs.readFile(process.env.DATABASE_PATH, 'utf8'));
    assert.ok(Buffer.byteLength(JSON.stringify(raw)) < 512 * 1024);
    const responseBytes = [],
      requestBytes = [];
    const request = async (url, options = {}) => {
      if (options.method === 'PATCH') {
        requestBytes.push(Buffer.byteLength(options.body));
        const body = JSON.parse(options.body);
        return { data: await applyKnowledgeCatalogDelta(body.delta, body.revision, actor) };
      }
      const query = Object.fromEntries(new URL(url, 'http://localhost').searchParams);
      const data = await readKnowledgeCatalogPage(query, actor);
      responseBytes.push(Buffer.byteLength(JSON.stringify(data)));
      return { data };
    };
    const before = await readKnowledgePages(request, 'large', () => {});
    assert.equal(before.knowledgeNotes.length, 10001);
    assert.ok(Math.max(...responseBytes) < 300 * 1024);
    const next = structuredClone(before);
    next.knowledgeNotes[0].title = 'Edited';
    const saved = await writeKnowledgeDelta(next, before.revision, request, 'large', () => {});
    assert.equal(saved.knowledgeNotes.length, 10001);
    assert.equal(saved.knowledgeNotes[0].title, 'Edited');
    assert.ok(requestBytes[0] < 2048);
    resetWorkspaceStore();
    const reloaded = await readKnowledgePages(request, 'reload', () => {});
    assert.equal(reloaded.knowledgeNotes[0].title, 'Edited');
    assert.equal(reloaded.knowledgeNotes.at(-1).title, before.knowledgeNotes.at(-1).title);
    const remove = structuredClone(reloaded);
    remove.knowledgeNotes.pop();
    const removed = await writeKnowledgeDelta(remove, reloaded.revision, request, 'reload', () => {});
    assert.equal(removed.knowledgeNotes.length, 10000);
    assert.equal((await getWorkspaceDatabase({ fields: ['knowledgeNotes'] })).knowledgeNotes.length, 10000);
    await assert.rejects(readKnowledgeCatalogPage({ revision: 0 }, actor), { code: 'REVISION_CONFLICT' });
    await assert.rejects(readKnowledgeCatalogPage({}, { ...actor, id: 'stranger', email: 'stranger@example.test' }), { statusCode: 403 });
    await assert.rejects(applyKnowledgeCatalogDelta(catalogDelta(reloaded, remove), reloaded.revision, actor), { statusCode: 409 });
    const reader = { ...actor, id: 'reader', email: 'reader@example.test' };
    await assert.rejects(applyKnowledgeCatalogDelta({}, removed.revision, reader), { statusCode: 403 });
  } finally {
    resetWorkspaceStore();
    resetStorageProvider();
    for (const [key, value] of Object.entries(old))
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('page assembly discards mixed revisions, fences account switches and never treats a partial page as complete', async () => {
  let calls = 0;
  const request = async url => {
    const q = new URL(url, 'http://local').searchParams,
      collection = q.get('collection');
    calls++;
    if (calls === 2) throw Object.assign(Error('Changed'), { code: 'REVISION_CONFLICT' });
    return {
      data: {
        revision: calls <= 2 ? 1 : 2,
        collection,
        offset: 0,
        total: collection === 'knowledgeNotes' ? 1 : 0,
        rows: collection === 'knowledgeNotes' ? [{ id: 'safe' }] : [],
        nextOffset: null,
      },
    };
  };
  assert.equal((await readKnowledgePages(request, 'safe', () => {})).revision, 2);
  await assert.rejects(
    readKnowledgePages(request, 'changed', () => {
      throw Object.assign(Error('Account changed'), { staleSession: true });
    }),
    { staleSession: true },
  );
  await assert.rejects(
    readKnowledgePages(
      async () => ({ data: { revision: 3, collection: 'knowledgeNotes', offset: 0, total: 2, rows: [{ id: 'partial' }], nextOffset: null } }),
      'partial',
      () => {},
    ),
    { code: 'KNOWLEDGE_METADATA_INTEGRITY' },
  );
});
