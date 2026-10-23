import test from 'node:test';
import assert from 'node:assert/strict';
import { writeCatalogShards, readCatalogShards, materializeCatalog } from '../../src/server/storage/file-catalog-shards.js';

test('immutable project parts preserve ordering, checksums, scoped reads and unchanged identities', async () => {
  const parts = new Map();
  const write = async text => {
    const id = `part-${parts.size}`;
    parts.set(id, text);
    return id;
  };
  const data = {
    schemaVersion: 3,
    revision: 8,
    files: Array.from({ length: 4501 }, (_, i) => ({ id: `f${i}`, project: i % 2 ? 'b' : 'a', name: `Файл ${i}` })),
  };
  const root = await writeCatalogShards(data, null, write);
  assert.equal(root.files, undefined);
  assert.equal(root._fileCatalog.shards.length, 4);
  assert.deepEqual(await materializeCatalog(root, id => parts.get(id)), data);
  const reads = [];
  const scoped = await readCatalogShards(
    root,
    id => {
      reads.push(id);
      return parts.get(id);
    },
    'b',
  );
  assert.deepEqual(
    scoped,
    data.files.filter(file => file.project === 'b'),
  );
  assert.equal(reads.length, 2);
  const again = await writeCatalogShards({ ...data, revision: 9 }, root._fileCatalog, () => assert.fail('Unchanged parts must be reused'));
  assert.deepEqual(again._fileCatalog, root._fileCatalog);
  const changed = structuredClone(data);
  changed.files[0].name = 'Изменено';
  const newer = await writeCatalogShards(changed, root._fileCatalog, write);
  assert.equal(parts.size, 5);
  assert.deepEqual(await materializeCatalog(root, id => parts.get(id)), data);
  assert.deepEqual(await materializeCatalog(newer, id => parts.get(id)), changed);
});

test('missing, corrupt or mixed catalogs fail closed instead of becoming an empty catalog', async () => {
  let text;
  const root = await writeCatalogShards({ schemaVersion: 3, files: [{ id: 'one', project: 'p' }] }, null, async value => {
    text = value;
    return 'part';
  });
  for (const read of [() => undefined, () => `${text} `, () => text.replace('one', 'two')]) {
    await assert.rejects(materializeCatalog(root, read), { code: 'FILE_CATALOG_CORRUPT' });
  }
  await assert.rejects(
    materializeCatalog({ ...root, files: [] }, () => text),
    { code: 'FILE_CATALOG_CORRUPT' },
  );
  await assert.rejects(
    materializeCatalog({ ...root, _fileCatalog: { ...root._fileCatalog, total: 2 } }, () => text),
    { code: 'FILE_CATALOG_CORRUPT' },
  );
  const legacy = { schemaVersion: 2, files: [{ id: 'old' }] };
  assert.equal(await materializeCatalog(legacy, () => assert.fail()), legacy);
});

test('an interrupted or failed root publication cannot change the previous manifest or its parts', async () => {
  const parts = new Map();
  const write = async value => {
    const id = `p${parts.size}`;
    parts.set(id, value);
    return id;
  };
  const data = {
    schemaVersion: 3,
    revision: 1,
    files: [
      { id: 'a', project: 'a' },
      { id: 'b', project: 'b' },
    ],
  };
  const root = await writeCatalogShards(data, null, write);
  const before = structuredClone(root);
  await assert.rejects(
    writeCatalogShards({ ...data, files: data.files.map(file => ({ ...file, name: 'new' })) }, root._fileCatalog, async value => {
      if (parts.size === 3) throw new Error('Upload interrupted');
      return write(value);
    }),
    /Upload interrupted/,
  );
  assert.deepEqual(root, before);
  assert.deepEqual(await materializeCatalog(root, id => parts.get(id)), data);
  // Rollback must materialize the latest root, not replay the pre-migration copy.
  const latest = await writeCatalogShards({ ...data, revision: 2, files: [...data.files, { id: 'new', project: 'a' }] }, root._fileCatalog, write);
  assert.equal((await materializeCatalog(latest, id => parts.get(id))).files.length, 3);
});
