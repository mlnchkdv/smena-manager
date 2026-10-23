import test from 'node:test';
import assert from 'node:assert/strict';
import { createCatalogReader } from '../../src/server/file-catalog-reader.js';
test('catalog reads clone only a bounded page and isolate role/project visibility', () => {
  const database = {
    revision: 4,
    members: [{ id: 'm' }],
    projects: [{ id: 'a' }, { id: 'b', private: true, members: ['other'] }],
    tasks: [],
    files: Array.from({ length: 1200 }, (_, i) => ({ id: `f${i}`, project: i < 1100 ? 'a' : 'b', name: 'original' })),
  };
  Object.defineProperty(database, 'knowledgeNotes', {
    enumerable: true,
    get() {
      throw Error('Must not clone the full aggregate');
    },
  });
  const read = createCatalogReader(database),
    user = { id: 'm', role: 'editor' };
  const page = read(user, { revision: 4 });
  assert.equal(page.total, 1100);
  assert.equal(page.files.length, 100);
  page.files[0].name = 'local';
  assert.equal(read(user, { revision: 4 }).files[0].name, 'original');
  assert.equal(read(user, { revision: 4, project: 'b' }).total, 0);
  assert.equal(read({ ...user, role: 'admin' }, { revision: 4, project: 'b' }).total, 100);
  assert.throws(() => read(user, { revision: 3 }), { code: 'REVISION_CONFLICT' });
});
