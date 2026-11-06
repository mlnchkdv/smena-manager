import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { GoogleDriveStorageProvider } from '../../src/server/storage/google-drive.js';
import { loadSearchPart, stageKnowledgeSearch } from '../../src/server/knowledge-search-store.js';
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
