import test from 'node:test';
import assert from 'node:assert/strict';
import { getStorageProvider, resetStorageProvider } from '../../src/server/storage/index.js';
import { createEmptyDatabase, resetWorkspaceStore } from '../../src/server/workspace-store.js';
import { replaceWorkspaceDocument } from '../../src/server/workspace-document-store.js';
import { rememberStorageVersion } from '../../src/server/storage/version-token.js';

function fixture(t) {
  const keys = ['VERCEL', 'WORKSPACE_WRITE_MODE', 'REDIS_URL'];
  const env = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  delete process.env.VERCEL;
  resetStorageProvider();
  resetWorkspaceStore();
  const storage = getStorageProvider();
  let stored = {
    ...createEmptyDatabase(),
    _aggregateVersion: 1,
    revision: 4,
    files: [{ id: 'f', project: 'p', name: 'Guide.txt', history: ['canonical metadata'], bytes: 12 }],
    _documentRevisions: { knowledge: { revision: 2 }, bookmarks: { revision: 0 } },
  };
  const reads = { full: 0, core: 0, writes: 0 };
  storage.init = async () => {};
  storage.loadDatabase = async () => {
    reads.full++;
    return rememberStorageVersion(structuredClone(stored), `v${stored.revision}`);
  };
  storage.loadDatabaseCore = async ({ identities }) => {
    assert.equal(identities, false);
    reads.core++;
    return { ...structuredClone(stored), files: [] };
  };
  storage.saveDatabase = async (next, options) => {
    assert.equal(options.expectedEtag, `v${stored.revision}`);
    reads.writes++;
    stored = structuredClone(next);
  };
  process.env.VERCEL = '1';
  process.env.WORKSPACE_WRITE_MODE = 'drive';
  delete process.env.REDIS_URL;
  t.after(() => {
    for (const key of keys) {
      if (env[key] === undefined) delete process.env[key];
      else process.env[key] = env[key];
    }
    resetStorageProvider();
    resetWorkspaceStore();
  });
  return { reads, data: () => structuredClone(stored) };
}

test('a cold document save reads the canonical catalog once, preserves full records and rejects stale document revisions', async t => {
  const f = fixture(t);
  const saved = await replaceWorkspaceDocument('knowledge', { knowledgeNotes: [{ id: 'n', title: 'Заметка' }], knowledgeFolders: [] }, 2);
  assert.equal(saved.revision, 3);
  assert.deepEqual(f.reads, { full: 1, core: 1, writes: 1 });
  assert.deepEqual(f.data().files[0].history, ['canonical metadata']);
  assert.equal(f.data().revision, 5);
  await assert.rejects(replaceWorkspaceDocument('knowledge', { knowledgeNotes: [], knowledgeFolders: [] }, 2), { code: 'REVISION_CONFLICT' });
  assert.equal(f.reads.writes, 1);
  assert.equal(f.data().knowledgeNotes[0].title, 'Заметка');
});
