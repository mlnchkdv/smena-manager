import test from 'node:test';
import assert from 'node:assert/strict';
import { storeKnowledgeBody } from '../../src/server/knowledge-body-store.js';
import { stageKnowledgeSearch } from '../../src/server/knowledge-search-store.js';
import { queryKnowledgeIndex } from '../../src/server/knowledge-search-query.js';
import { directoryMayMatch, readKnowledgeDirectory } from '../../src/server/knowledge-search-directory.js';
import { cacheSearchValue, cachedSearchValue, resetKnowledgeSearchCache } from '../../src/server/knowledge-search-cache.js';
import { getStorageProvider, resetStorageProvider } from '../../src/server/storage/index.js';
import { inWorkspace } from '../../src/server/workspace-context.js';
import { randomUUID } from 'node:crypto';
import { createKnowledgeMatcher } from '../../src/shared/knowledge-search.js';

test('a revision-bound directory prunes cold text parts and never drops metadata/body split, short, Unicode or quoted matches', async () => {
  await inWorkspace(randomUUID(), async () => {
    const storage = getStorageProvider(),
      objects = new Map();
    storage.writeKnowledgeSearch = async (text, hash) => objects.set(hash, text);
    storage.readKnowledgeSearch = async hash => objects.get(hash);
    storage.writeKnowledgeBody = async (text, hash) => objects.set(hash, text);
    storage.readKnowledgeBody = async hash => objects.get(hash);
    const profile = { id: 'reader', email: 'reader@example.test' };
    const next = { members: [{ ...profile, role: 'Member', status: 'active' }], knowledgeNotes: [], knowledgeFolders: [] };
    const full = [];
    for (let i = 0; i < 200; i++)
      next.knowledgeNotes.push(
        await storeKnowledgeBody(storage, {
          id: 'node-' + i,
          title: i === 199 ? 'MetadataAlpha' : 'Item ' + i,
          formatted_markdown: i === 199 ? 'редкиймаркер🧩 and BODYBETA' : 'ordinary body ' + i,
        }),
      );
    for (let i = 0; i < 200; i++)
      full.push({
        id: 'node-' + i,
        title: i === 199 ? 'MetadataAlpha' : 'Item ' + i,
        formatted_markdown: i === 199 ? 'редкиймаркер🧩 and BODYBETA' : 'ordinary body ' + i,
      });
    await stageKnowledgeSearch(next, {}, storage, { reset: true });
    const directory = await readKnowledgeDirectory(storage, next._knowledgeSearch);
    const part = next._knowledgeSearch.parts.find(p => p.members.some(([id]) => id === 'node-199'));
    for (const term of ['редкиймаркер', '🧩', 'BODYBETA'.toLowerCase(), 'a', '"'])
      assert.equal(directoryMayMatch(directory.get(part.prefix), [term], ''), true);
    const calls = [];
    storage.readKnowledgeSearch = async hash => {
      calls.push(hash);
      return objects.get(hash);
    };
    resetKnowledgeSearchCache();
    storage.readKnowledgeBody = async () => {
      throw Error('Source body read');
    };
    for (const query of ['редкиймаркер', 'MetadataAlpha BODYBETA', '"редкиймаркер🧩"', 'BODYBETA']) {
      const result = await queryKnowledgeIndex(next, profile, [], { query, mode: query.startsWith('"') ? 'workspace' : 'knowledge' });
      assert.deepEqual(result.matches, ['node-199'], query);
      assert.ok(result.snippets['node-199'].text.length <= 240);
      assert.ok(result.snippets['node-199'].text.includes('редкиймаркер') || result.snippets['node-199'].text.includes('bodybeta'));
    }
    assert.ok(new Set(calls).size < next._knowledgeSearch.parts.length, 'rare queries avoid full derived-text scan');
    for (const query of [
      'марк',
      '🧩',
      'item 1',
      '"ordinary body 19"',
      'ordinary BODY',
      'MetadataAlpha BODYBETA',
      '"metadataalpha    редкиймаркер🧩"',
      '[literal]',
    ]) {
      assert.deepEqual(
        (await queryKnowledgeIndex(next, profile, [], { query })).matches,
        full.filter(createKnowledgeMatcher(query)).map(n => n.id),
        query,
      );
    }
    const meta = next.knowledgeNotes[199];
    meta.title = 'newboundary';
    assert.deepEqual((await queryKnowledgeIndex(next, profile, [], { query: 'newboundary редкиймаркер' })).matches, ['node-199']);
    resetKnowledgeSearchCache();
    objects.set(next._knowledgeSearch.directory.sha256, 'broken');
    await assert.rejects(queryKnowledgeIndex(next, profile, [], { query: 'absent' }), { code: 'KNOWLEDGE_SEARCH_UNAVAILABLE' });
    resetStorageProvider();
    resetKnowledgeSearchCache();
  });
});

test('the shared search cache budget evicts across providers without mixing identities', () => {
  resetKnowledgeSearchCache();
  const first = {},
    second = {};
  cacheSearchValue(first, 'same', 'private first', 12 * 1024 * 1024);
  cacheSearchValue(second, 'same', 'private second', 12 * 1024 * 1024);
  assert.equal(cachedSearchValue(first, 'same'), 'private first');
  cacheSearchValue(second, 'new', 'fresh', 4 * 1024 * 1024);
  assert.equal(cachedSearchValue(second, 'same'), undefined);
  assert.equal(cachedSearchValue(first, 'same'), 'private first');
  assert.equal(cachedSearchValue(second, 'new'), 'fresh');
  resetKnowledgeSearchCache();
});

test('aborting cold search stops scheduling remaining index parts and never reads source bodies', async () => {
  await inWorkspace(randomUUID(), async () => {
    const storage = getStorageProvider(),
      objects = new Map();
    storage.writeKnowledgeSearch = storage.writeKnowledgeBody = async (text, hash) => objects.set(hash, text);
    storage.readKnowledgeSearch = storage.readKnowledgeBody = async hash => objects.get(hash);
    const profile = { id: 'reader', email: 'reader@example.test' };
    const next = { members: [{ ...profile, role: 'Member' }], knowledgeNotes: [], knowledgeFolders: [] };
    for (let i = 0; i < 200; i++)
      next.knowledgeNotes.push(await storeKnowledgeBody(storage, { id: 'cancel-' + i, title: 'Note ' + i, formatted_markdown: 'common body ' + i }));
    await stageKnowledgeSearch(next, {}, storage, { reset: true });
    resetKnowledgeSearchCache();
    const controller = new AbortController();
    let parts = 0;
    storage.readKnowledgeBody = async () => {
      throw Error('Original body read');
    };
    storage.readKnowledgeSearch = async (hash, { signal } = {}) => {
      assert.equal(signal, controller.signal);
      if (hash !== next._knowledgeSearch.directory.sha256) {
        parts++;
        controller.abort();
        signal.throwIfAborted();
      }
      return objects.get(hash);
    };
    await assert.rejects(queryKnowledgeIndex(next, profile, [], { query: 'common', signal: controller.signal }), { name: 'AbortError' });
    assert.ok(parts > 0 && parts <= 3);
    assert.ok(parts < next._knowledgeSearch.parts.length);
  });
  resetStorageProvider();
  resetKnowledgeSearchCache();
});
