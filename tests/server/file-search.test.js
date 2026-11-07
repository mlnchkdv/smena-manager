import test from 'node:test';
import assert from 'node:assert/strict';
import { searchFilePage } from '../../src/server/file-search.js';
test('global file search returns selected public metadata only, preserves paging and rechecks current project rights', async () => {
  const user = { id: 'm', email: 'm@example.test', role: 'editor' },
    base = {
      revision: 9,
      members: [{ ...user, role: 'Member' }],
      projects: [{ id: 'p', name: 'Project', members: ['m'], privacy: 'private' }],
      files: [{ id: 'f', name: 'Report', project: 'p', storageFileId: 'private-drive-id', storageName: 'private-path', history: [{ secret: 'old' }] }],
    };
  const query = async (_user, options) => {
    assert.equal(options.limit, 30);
    return { revision: 9, page: 1, total: 90, files: [{ id: 'f' }] };
  };
  const read = async (_user, ids) => {
    assert.deepEqual(ids, ['f']);
    return structuredClone(base);
  };
  const result = await searchFilePage({ query: 'Report', revision: 9, offset: 30 }, user, [], { query, read });
  assert.equal(result.offset, 30);
  assert.equal(result.total, 90);
  assert.equal(result.complete, true);
  assert.deepEqual(result.files, [{ id: 'f', name: 'Report', project: 'p', projectName: 'Project' }]);
  await assert.rejects(searchFilePage({ query: 'Report', revision: 9 }, user, [], { query, read: async () => ({ ...base, revision: 10 }) }), {
    code: 'REVISION_CONFLICT',
  });
  await assert.rejects(
    searchFilePage({ query: 'Report', revision: 9 }, user, [], {
      query,
      read: async () => ({ ...base, members: [{ ...base.members[0], status: 'removed' }] }),
    }),
    { statusCode: 403 },
  );
  await assert.rejects(searchFilePage({ query: 'Report', revision: 9 }, user, [], { query, read: async () => ({ ...base, projects: [] }) }), {
    statusCode: 403,
  });
});
