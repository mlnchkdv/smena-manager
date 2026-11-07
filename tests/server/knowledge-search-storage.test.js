import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { GoogleDriveStorageProvider } from '../../src/server/storage/google-drive.js';
import { loadSearchPart, stageKnowledgeSearch, knowledgeSearchParts } from '../../src/server/knowledge-search-store.js';
import { deflateRawSync } from 'node:zlib';
import { cacheSearchValue } from '../../src/server/knowledge-search-cache.js';
import { resetKnowledgeSearchCache } from '../../src/server/knowledge-search-cache.js';

test('Drive index objects use the workspace parent, unique marker and checked immutable identities', async () => {
  const storage = new GoogleDriveStorageProvider();
  storage.rootFolderId = 'own-workspace';
  storage.init = async () => {};
  const queries = [],
    objects = new Map();
  storage.client = {
    files: {
      list: async args => {
        queries.push(args);
        return { data: { files: [] } };
      },
      create: async args => {
        let text = '';
        for await (const chunk of args.media.body) text += chunk;
        objects.set(args.requestBody.name, text);
        assert.equal(args.requestBody.appProperties.smenaKnowledgeSearch, '1');
        return { data: { id: 'index-object' } };
      },
    },
  };
  const next = { knowledgeNotes: [{ id: 'a', bodyRef: { sha256: 'a'.repeat(64) }, searchVersion: 1 }] };
  storage.readKnowledgeBody = async () => {
    throw Error('Body cache required by fixture');
  };
  const { cacheSearchValue } = await import('../../src/server/knowledge-search-cache.js');
  cacheSearchValue(storage, 'body:' + 'a'.repeat(64), 'needle', 12);
  await stageKnowledgeSearch(next, {}, storage);
  const part = next._knowledgeSearch.parts[0];
  assert.match(queries[0].q, /'own-workspace' in parents/);
  assert.match(queries[0].q, /smenaKnowledgeSearch/);
  storage.client.files.list = async () => ({ data: { files: [{ id: 'object', size: part.bytes }] } });
  storage.client.files.get = async () => ({ data: objects.get('smena-knowledge-search-' + part.sha256 + '.json') });
  resetKnowledgeSearchCache();
  assert.equal((await loadSearchPart(storage, part)).get('a')[2], 'needle');
  storage.client.files.list = async () => ({ data: { files: [{ id: 'one' }, { id: 'two' }] } });
  await assert.rejects(storage.readKnowledgeSearch(part.sha256), { code: 'DRIVE_STORAGE_AMBIGUOUS' });
  await assert.rejects(storage.writeKnowledgeSearch('wrong', createHash('sha256').update('other').digest('hex')), { code: 'KNOWLEDGE_SEARCH_UNAVAILABLE' });
});

test('inserting into a gap in previously split search buckets preserves sibling coverage through deletion and reload', async () => {
  const digest = text => createHash('sha256').update(text).digest('hex');
  const idFor = prefix => {
    for (let i = 0; ; i++) if (digest('note-' + i).startsWith(prefix)) return 'note-' + i;
  };
  const a = idFor('a0'),
    b = idFor('a1'),
    c = idFor('a2');
  const objects = new Map();
  const storage = {
    async writeKnowledgeSearch(text, hash) {
      assert.equal(digest(text), hash);
      objects.set(hash, text);
    },
    async readKnowledgeSearch(hash) {
      return objects.get(hash);
    },
  };
  const row = [a, digest(a), 'old sibling text'];
  const raw = JSON.stringify([row]);
  const text = JSON.stringify({
    format: 'smena-knowledge-search-v1',
    prefix: 'a0',
    rawBytes: Buffer.byteLength(raw),
    data: deflateRawSync(Buffer.from(raw)).toString('base64'),
  });
  const part = { prefix: 'a0', sha256: digest(text), bytes: Buffer.byteLength(text), rawBytes: Buffer.byteLength(raw), members: [row.slice(0, 2)] };
  objects.set(part.sha256, text);
  const note = id => ({ id, searchVersion: 1, bodyRef: { sha256: digest(id) } });
  for (const id of [b, c]) cacheSearchValue(storage, 'body:' + digest(id), 'new text ' + id, 100);
  const previous = { knowledgeNotes: [note(a)], _knowledgeSearch: { version: 1, parts: [part] } };
  const next = structuredClone(previous);
  next.knowledgeNotes.push(note(b), note(c));
  await stageKnowledgeSearch(next, previous, storage);
  assert.deepEqual(
    knowledgeSearchParts(next).map(p => p.prefix),
    ['a0', 'a1', 'a2'],
  );
  assert.deepEqual(next._knowledgeSearch.parts[0], part, 'retained sibling is not rewritten');
  resetKnowledgeSearchCache();
  const ids = [];
  for (const p of next._knowledgeSearch.parts) ids.push(...(await loadSearchPart(storage, p)).keys());
  assert.deepEqual(new Set(ids), new Set([a, b, c]));
  const removed = structuredClone(next);
  removed.knowledgeNotes = removed.knowledgeNotes.filter(n => n.id !== b);
  await stageKnowledgeSearch(removed, next, storage);
  assert.deepEqual(
    knowledgeSearchParts(removed).map(p => p.prefix),
    ['a0', 'a2'],
  );
  const returned = structuredClone(removed);
  returned.knowledgeNotes.push(note(b));
  cacheSearchValue(storage, 'body:' + digest(b), 'restored text ' + b, 100);
  await stageKnowledgeSearch(returned, removed, storage);
  resetKnowledgeSearchCache();
  assert.deepEqual(
    knowledgeSearchParts(returned).map(p => p.prefix),
    ['a0', 'a1', 'a2'],
  );
  assert.equal(
    (
      await loadSearchPart(
        storage,
        returned._knowledgeSearch.parts.find(p => p.prefix === 'a0'),
      )
    ).get(a)[2],
    row[2],
  );
});
