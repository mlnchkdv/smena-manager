import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeCatalogShards, readCatalogShards, materializeCatalog, catalogCore } from '../../src/server/storage/file-catalog-shards.js';
import { fileCatalogIndex } from '../../src/server/file-catalog-index.js';

test('search projection drops heavy/private metadata only after validating the original part', async () => {
  const parts = new Map();
  const file = { id: 'f', name: 'Файл.md', project: 'p', tags: ['tag'], bytes: 12, storageFileId: 'private-drive-id', versions: ['x'.repeat(200000)] };
  const root = await writeCatalogShards({ files: [file] }, null, async value => {
    const id = `part-${parts.size}`;
    parts.set(id, value);
    return id;
  });
  const rows = await readCatalogShards(root, id => parts.get(id), { projects: new Set(['p']) }, fileCatalogIndex);
  assert.deepEqual(rows, [{ id: 'f', name: 'Файл.md', project: 'p', tags: ['tag'], bytes: 12 }]);
  assert.ok(JSON.stringify(rows).length < 150);
  await assert.rejects(
    readCatalogShards(root, id => parts.get(id) + ' ', undefined, fileCatalogIndex),
    { code: 'FILE_CATALOG_CORRUPT' },
  );
  assert.deepEqual((await materializeCatalog(root, id => parts.get(id))).files, [file], 'Canonical writes still receive complete records');
});

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
  const core = catalogCore(root);
  assert.equal(core.files.length, 4501);
  assert.equal(core.files[0].name, undefined);
  assert.equal(core.files[0].id, 'f0');
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
  const selectedReads = [];
  const selected = await readCatalogShards(
    root,
    id => {
      selectedReads.push(id);
      return parts.get(id);
    },
    { projects: new Set(['b']), ids: new Set(['f1']) },
  );
  assert.equal(selectedReads.length, 1);
  assert.ok(selected.every(file => file.project === 'b'));
  const again = await writeCatalogShards({ ...data, revision: 9 }, root._fileCatalog, () => assert.fail('Unchanged parts must be reused'));
  assert.deepEqual(again._fileCatalog.shards, root._fileCatalog.shards);
  assert.equal(again._fileCatalog.accounting.revision, 9, 'Accounting belongs to the new root even when parts are reused');
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
  const corruptIndex = structuredClone(root);
  corruptIndex._fileCatalog.shards[0].keys[0][0] = 'wrong-id';
  await assert.rejects(
    materializeCatalog(corruptIndex, () => text),
    { code: 'FILE_CATALOG_CORRUPT' },
  );
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

test('global reorder and insertion reuse unrelated project parts without losing file order', async () => {
  const parts = new Map();
  const write = async text => {
    const id = `p${parts.size}`;
    parts.set(id, text);
    return id;
  };
  const files = [
    { id: 'a', project: 'a' },
    { id: 'b', project: 'b' },
    { id: 'a2', project: 'a' },
  ];
  const root = await writeCatalogShards({ files }, null, write);
  const reordered = await writeCatalogShards({ files: [...files].reverse() }, root._fileCatalog, () => assert.fail('Order must only change the root'));
  assert.deepEqual((await materializeCatalog(reordered, id => parts.get(id))).files, [...files].reverse());
  const inserted = [{ id: 'c', project: 'c' }, ...files];
  const latest = await writeCatalogShards({ files: inserted }, root._fileCatalog, write);
  assert.equal(parts.size, 3);
  for (const previous of root._fileCatalog.shards) assert.ok(latest._fileCatalog.shards.some(part => part.id === previous.id));
  assert.deepEqual((await materializeCatalog(latest, id => parts.get(id))).files, inserted);
  const broken = structuredClone(latest);
  broken._fileCatalog.shards[1].keys[0][4] = broken._fileCatalog.shards[0].keys[0][4];
  await assert.rejects(
    materializeCatalog(broken, id => parts.get(id)),
    { code: 'FILE_CATALOG_CORRUPT' },
  );
});

test('legacy manifest versions remain readable with numeric positions inside parts', async () => {
  const files = [{ id: 'old', project: 'p' }];
  const text = JSON.stringify([[0, files[0]]]);
  const part = { id: 'legacy', project: 'p', count: 1, bytes: Buffer.byteLength(text), sha256: createHash('sha256').update(text).digest('hex') };
  for (const version of [1, 2]) {
    const descriptor = version === 2 ? { ...part, keys: [['old', '', 0, '']] } : part;
    assert.deepEqual(await materializeCatalog({ _fileCatalog: { version, total: 1, shards: [descriptor] } }, () => text), { files });
  }
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
