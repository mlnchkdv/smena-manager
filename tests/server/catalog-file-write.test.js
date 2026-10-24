import test from 'node:test';
import assert from 'node:assert/strict';
import { writeCatalogShards, readCatalogShards, materializeCatalog, catalogCore } from '../../src/server/storage/file-catalog-shards.js';
import { writeFileMetadataParts, filePatchTasks, filePatchIds } from '../../src/server/storage/catalog-file-write.js';
import { createCatalogAccounting } from '../../src/server/file-catalog-accounting.js';

async function fixture() {
  const data = {
    schemaVersion: 3,
    _aggregateVersion: 1,
    revision: 9,
    projects: [{ id: 'p', fileFolders: [{ id: 'folder', name: 'Папка' }] }, { id: 'hidden' }],
    tasks: [{ id: 't', project: 'p', attachments: [{ id: 'f1', name: '1.txt', folderId: null }] }],
    files: Array.from({ length: 2100 }, (_, i) => ({
      id: `f${i}`,
      project: i % 2 ? 'p' : 'hidden',
      name: `${i}.txt`,
      bytes: 12,
      history: ['keep'.repeat(600)],
    })),
  };
  const parts = new Map();
  const write = async text => {
    const id = `part-${parts.size}`;
    parts.set(id, text);
    return id;
  };
  const root = await writeCatalogShards(data, null, write);
  const reads = [];
  const before = await readCatalogShards(
    root,
    async id => {
      reads.push(id);
      return parts.get(id);
    },
    { ids: new Set(['f1']) },
  );
  return { data, root, before, parts, write, reads };
}

test('file metadata COW preserves unrelated pointers, histories, global order and exact accounting', async () => {
  const f = await fixture();
  assert.equal(f.reads.length, 1, 'Only the part containing the selected ID is read');
  // One selected ID should actually select one containing part, never all project parts.
  assert.ok(f.reads.length < f.root._fileCatalog.shards.length);
  const after = f.before.map(file => (file.id === 'f1' ? { ...file, name: 'Новое имя 📂.md', folderId: 'folder' } : file));
  const tasks = filePatchTasks(catalogCore(f.root), after);
  const root = await writeFileMetadataParts(f.root, f.before, after, tasks, 10, new Date().toISOString(), f.write);
  const full = await materializeCatalog(root, async id => f.parts.get(id));
  const expected = structuredClone(f.data);
  Object.assign(
    expected.files.find(file => file.id === 'f1'),
    { name: 'Новое имя 📂.md', folderId: 'folder' },
  );
  assert.deepEqual(full.files, expected.files);
  assert.equal(full.tasks[0].attachments[0].folderId, 'folder');
  assert.deepEqual(root._fileCatalog.accounting, createCatalogAccounting(full));
  for (const old of f.root._fileCatalog.shards.filter(part => !part.keys.some(([id]) => id === 'f1')))
    assert.deepEqual(
      root._fileCatalog.shards.find(part => part.id === old.id),
      old,
    );
});

test('file metadata writer rejects forged identities, physical/ACL changes, missing rows and unrelated task edits', async () => {
  const f = await fixture();
  for (const change of [file => ({ ...file, storageName: 'forged' }), file => ({ ...file, project: 'hidden' }), file => ({ ...file, bytes: 500 })]) {
    const after = f.before.map(file => (file.id === 'f1' ? change(file) : file));
    await assert.rejects(writeFileMetadataParts(f.root, f.before, after, f.root.tasks, 10, new Date().toISOString(), f.write), {
      code: 'FILE_PATCH_FORBIDDEN',
    });
  }
  await assert.rejects(writeFileMetadataParts(f.root, f.before.slice(1), f.before.slice(1), f.root.tasks, 10, new Date().toISOString(), f.write), {
    code: 'FILE_PATCH_FORBIDDEN',
  });
  await assert.rejects(writeFileMetadataParts(f.root, f.before, f.before, [{ ...f.root.tasks[0], title: 'Injected' }], 10, new Date().toISOString(), f.write), {
    code: 'FILE_PATCH_FORBIDDEN',
  });
});

test('500 Unicode metadata edits split a growing part without losing order or unchanged project pointers', async () => {
  const f = await fixture();
  assert.ok(f.before.length > 500);
  const after = f.before.map((file, index) => (index < 500 ? { ...file, name: `${'Ж'.repeat(120)}-${index}.md` } : file));
  const updates = after.slice(0, 500);
  assert.equal(filePatchIds({ upsert: updates, remove: [] }).size, 500);
  assert.equal(filePatchIds({ upsert: after.slice(0, 501), remove: [] }), null);
  const root = await writeFileMetadataParts(f.root, f.before, after, filePatchTasks(catalogCore(f.root), after), 10, new Date().toISOString(), f.write);
  assert.ok(root._fileCatalog.shards.length > f.root._fileCatalog.shards.length, 'Growing bytes split through the bounded canonical writer');
  const full = await materializeCatalog(root, async id => f.parts.get(id));
  const changed = new Map(updates.map(file => [file.id, file]));
  assert.deepEqual(
    full.files,
    f.data.files.map(file => changed.get(file.id) || file),
  );
  assert.deepEqual(root._fileCatalog.accounting, createCatalogAccounting(full));
  for (const old of f.root._fileCatalog.shards.filter(part => part.project === 'hidden'))
    assert.deepEqual(
      root._fileCatalog.shards.find(part => part.id === old.id),
      old,
    );
});
