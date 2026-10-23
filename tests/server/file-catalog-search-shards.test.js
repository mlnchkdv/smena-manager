import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeCatalogShards, readCatalogShards, materializeCatalog, validateCatalogManifest } from '../../src/server/storage/file-catalog-shards.js';
import { fileCatalogIndex } from '../../src/server/file-catalog-index.js';
import { catalogQuery } from '../../src/server/file-catalog-query.js';
import { GoogleDriveStorageProvider } from '../../src/server/storage/google-drive.js';

function fixture() {
  const parts = new Map();
  return {
    parts,
    write: async text => {
      const id = `part-${parts.size}`;
      parts.set(id, text);
      return id;
    },
  };
}
const search = (root, read, scope) => readCatalogShards(root, read, scope, fileCatalogIndex, true);
const hash = text => createHash('sha256').update(text).digest('hex');

test('cold catalog queries read compact indexes only, preserving bilingual search, sorting, counts and canonical rows', async () => {
  const f = fixture();
  const data = {
    revision: 9,
    members: [{ id: 'm', role: 'Member' }],
    projects: [{ id: 'p', name: 'Проект' }],
    tasks: [],
    files: Array.from({ length: 120 }, (_, i) => ({
      id: `f-${i}`,
      name: `Инструкция Guide ${i}.md`,
      project: 'p',
      folderId: 'folder',
      type: 'doc',
      bytes: i,
      tags: ['команда', 'team'],
      at: '2026-10-24',
      storageFileId: `private-${i}`,
      versions: [{ comment: 'x'.repeat(50000) }],
    })),
  };
  const root = await writeCatalogShards(data, null, f.write);
  const reads = [];
  const files = await search(
    root,
    id => {
      reads.push(id);
      return f.parts.get(id);
    },
    { projects: new Set(['p']) },
  );
  assert.deepEqual(files, data.files.map(fileCatalogIndex));
  assert.deepEqual(
    reads,
    root._fileCatalog.shards.map(part => part.search.id),
  );
  const originalBytes = root._fileCatalog.shards.reduce((sum, part) => sum + part.bytes, 0);
  const searchBytes = reads.reduce((sum, id) => sum + Buffer.byteLength(f.parts.get(id)), 0);
  assert.ok(searchBytes < originalBytes / 100, `${searchBytes} vs ${originalBytes}`);
  for (const query of ['инструкция', 'GUIDE 119', 'команда', 'team', 'missing'])
    for (const sort of ['date', 'name', 'size', 'project']) {
      const options = { revision: 9, query, sort, countFolders: [['p', 'folder']] };
      assert.deepEqual(catalogQuery({ ...data, files }, { id: 'm', role: 'editor' }, options), catalogQuery(data, { id: 'm', role: 'editor' }, options));
    }
  assert.deepEqual(await materializeCatalog(root, id => f.parts.get(id)), data);
});

test('history-only updates reuse search identities; search field changes atomically publish a new index', async () => {
  const f = fixture();
  const data = { files: [{ id: 'f', project: 'p', name: 'Before', versions: ['private-1'] }] };
  const root = await writeCatalogShards(data, null, f.write);
  const changed = { files: [{ ...data.files[0], versions: ['private-2'] }] };
  const next = await writeCatalogShards(changed, root._fileCatalog, f.write);
  assert.notEqual(next._fileCatalog.shards[0].id, root._fileCatalog.shards[0].id);
  assert.deepEqual(next._fileCatalog.shards[0].search, root._fileCatalog.shards[0].search);
  const renamed = await writeCatalogShards({ files: [{ ...changed.files[0], name: 'После' }] }, next._fileCatalog, f.write);
  assert.notEqual(renamed._fileCatalog.shards[0].search.id, next._fileCatalog.shards[0].search.id);
  assert.equal((await search(root, id => f.parts.get(id)))[0].name, 'Before');
  assert.equal((await search(renamed, id => f.parts.get(id)))[0].name, 'После');
  await writeCatalogShards(changed, next._fileCatalog, () => assert.fail('Unchanged canonical and search bytes must both be reused'));
});

test('v3 without search descriptors falls back safely and indexes on next write without rewriting canonical parts', async () => {
  const f = fixture();
  const data = { files: [{ id: 'f', project: 'p', name: 'Legacy', versions: ['history'] }] };
  const root = await writeCatalogShards(data, null, f.write);
  delete root._fileCatalog.shards[0].search;
  const reads = [];
  assert.deepEqual(
    await search(root, id => {
      reads.push(id);
      return f.parts.get(id);
    }),
    data.files.map(fileCatalogIndex),
  );
  assert.deepEqual(reads, [root._fileCatalog.shards[0].id]);
  const writes = [];
  const next = await writeCatalogShards(data, root._fileCatalog, text => {
    writes.push(text);
    return f.write(text);
  });
  assert.equal(next._fileCatalog.shards[0].id, root._fileCatalog.shards[0].id);
  assert.equal(writes.length, 1);
  assert.deepEqual(await materializeCatalog(next, id => f.parts.get(id)), data);
});

test('search read rejects missing bytes, bad checksums, mismatched root keys and private payload fields', async () => {
  const f = fixture();
  const root = await writeCatalogShards(
    { files: [{ id: 'f', project: 'p', folderId: 'folder', task: 'task', bytes: 10, versions: ['history'] }] },
    null,
    f.write,
  );
  for (const value of [undefined, '[]', f.parts.get(root._fileCatalog.shards[0].search.id) + ' '])
    await assert.rejects(
      search(root, () => value),
      { code: 'FILE_CATALOG_CORRUPT' },
    );
  for (const change of [
    row => {
      row[0] = 'else';
    },
    row => {
      row[1].project = 'private';
    },
    row => {
      row[1].folderId = 'else';
    },
    row => {
      row[1].bytes++;
    },
    row => {
      row[1].task = 'else';
    },
    row => {
      row[1].storageFileId = 'secret';
    },
  ]) {
    const broken = structuredClone(root);
    const rows = JSON.parse(f.parts.get(broken._fileCatalog.shards[0].search.id));
    change(rows[0]);
    const text = JSON.stringify(rows);
    Object.assign(broken._fileCatalog.shards[0].search, { sha256: hash(text), bytes: Buffer.byteLength(text) });
    await assert.rejects(
      search(broken, () => text),
      { code: 'FILE_CATALOG_CORRUPT' },
    );
  }
  for (const change of [
    part => {
      part.search.version = 2;
    },
    part => {
      part.search.id = part.id;
    },
    part => {
      part.search.bytes = 0;
    },
  ]) {
    const broken = structuredClone(root);
    change(broken._fileCatalog.shards[0]);
    assert.throws(() => validateCatalogManifest(broken._fileCatalog), { code: 'FILE_CATALOG_CORRUPT' });
  }
});

test('provider scopes cold/warm index reads using the latest ACL root and keeps selected file hydration canonical', async () => {
  const f = fixture();
  let root = await writeCatalogShards(
    {
      revision: 1,
      projects: [{ id: 'p' }, { id: 'secret' }],
      files: [
        { id: 'f', project: 'p', name: 'Guide', versions: ['history'], storageFileId: 'drive-f' },
        { id: 'private', project: 'secret', versions: ['hidden'] },
      ],
    },
    null,
    f.write,
  );
  const provider = new GoogleDriveStorageProvider();
  provider.initialized = true;
  provider.databaseFileId = 'db';
  const reads = [];
  provider.client = {
    files: {
      get: async ({ fileId }) => {
        reads.push(fileId);
        return { data: fileId === 'db' ? JSON.stringify(root) : f.parts.get(fileId), headers: { etag: `rev-${root.revision}` } };
      },
    },
  };
  const select = core => ({ projects: new Set(core.projects.filter(p => !p.private).map(p => p.id)) });
  root.projects[1].private = true;
  assert.equal((await provider.loadDatabaseCatalogIndex(select)).files.length, 1);
  assert.deepEqual(reads, ['db', root._fileCatalog.shards[0].search.id]);
  reads.length = 0;
  await provider.loadDatabaseCatalogIndex(select);
  assert.deepEqual(reads, ['db']);
  root.projects[0].private = true;
  root.revision++;
  reads.length = 0;
  assert.deepEqual((await provider.loadDatabaseCatalogIndex(select)).files, []);
  assert.deepEqual(reads, ['db'], 'Warm cache cannot bypass revoked scope');
  root.projects[0].private = false;
  reads.length = 0;
  const full = await provider.loadDatabaseCatalog(core => ({ ...select(core), ids: new Set(['f']) }));
  assert.equal(full.files[0].storageFileId, 'drive-f');
  assert.deepEqual(full.files[0].versions, ['history']);
  assert.deepEqual(reads, ['db', root._fileCatalog.shards[0].id]);
});

test('interrupted index publication leaves prior canonical and search roots intact', async () => {
  const f = fixture();
  const data = { files: [{ id: 'f', project: 'p', name: 'Before', versions: ['history'] }] };
  const root = await writeCatalogShards(data, null, f.write);
  const before = structuredClone(root);
  let writes = 0;
  await assert.rejects(
    writeCatalogShards({ files: [{ ...data.files[0], name: 'After' }] }, root._fileCatalog, text => {
      if (++writes === 2) throw Error('Index upload interrupted');
      return f.write(text);
    }),
    /Index upload interrupted/,
  );
  assert.deepEqual(root, before);
  assert.deepEqual(await materializeCatalog(root, id => f.parts.get(id)), data);
  assert.equal((await search(root, id => f.parts.get(id)))[0].name, 'Before');
});
