import test from 'node:test';
import assert from 'node:assert/strict';
import { fileCatalogPage, fileCatalogChanges, applyFileCatalogChanges } from '../../src/shared/file-catalog.js';
import { projectWorkspace, mergeClientWorkspace } from '../../src/server/workspace-policy.js';
import { hydrateFileCatalog, catalogWrite } from '../../src/core/file-catalog-transport.js';

test('catalog pages are bounded, scoped by project and pinned to one revision', () => {
  const data = { revision: 8, files: Array.from({ length: 321 }, (_, i) => ({ id: `f${i}`, project: i < 220 ? 'a' : 'b' })) };
  const page = fileCatalogPage(data, { revision: 8, project: 'a', offset: 100 });
  assert.equal(page.files.length, 100);
  assert.equal(page.total, 220);
  assert.equal(page.nextOffset, 200);
  assert.equal(fileCatalogPage(data, { revision: 8, project: 'b', offset: 100 }).nextOffset, null);
  assert.throws(() => fileCatalogPage(data, { revision: 7 }), { code: 'REVISION_CONFLICT' });
  for (const offset of [-1, 0.5, NaN]) assert.throws(() => fileCatalogPage(data, { revision: 8, offset }));
});

test('catalog delta reconstructs complete data before ACL validation; hidden files survive', () => {
  const current = {
    revision: 1,
    members: [],
    projects: [
      { id: 'a', members: ['m'] },
      { id: 'b', private: true, members: ['other'] },
    ],
    files: [
      { id: 'a', project: 'a', name: 'before' },
      { id: 'b', project: 'b', name: 'private' },
    ],
    tasks: [],
    trash: [],
  };
  const visible = projectWorkspace(current, { id: 'm', role: 'editor' });
  assert.equal(fileCatalogPage(visible, { revision: 1 }).total, 1);
  const after = [{ ...visible.files[0], name: 'after' }];
  const incoming = { ...visible, files: applyFileCatalogChanges(visible.files, fileCatalogChanges(visible.files, after)) };
  const merged = mergeClientWorkspace(current, incoming, 'editor', 'm');
  assert.equal(merged.files.find(file => file.id === 'b').name, 'private');
  current.projects[0].perms = { m: 'Can view' };
  assert.throws(() => mergeClientWorkspace(current, incoming, 'editor', 'm'), { code: 'ENTITY_FORBIDDEN' });
  assert.throws(() => applyFileCatalogChanges([], { remove: ['a'], upsert: [{ id: 'a' }] }));
});

test('transport never publishes an incomplete catalog or reuses another session baseline', async () => {
  const data = { revision: 3, projects: [], tasks: [] };
  const files = [
    { id: 'a', name: 'one' },
    { id: 'b', name: 'two' },
  ];
  const hydrated = await hydrateFileCatalog(
    { data, fileCatalog: { total: 2 } },
    async path =>
      path.includes('offset=0') ? { revision: 3, total: 2, files: [files[0]], nextOffset: 1 } : { revision: 3, total: 2, files: [files[1]], nextOffset: null },
    1,
  );
  assert.deepEqual(hydrated.files, files);
  assert.deepEqual(catalogWrite({ ...data, files: [files[1]] }, 3, 1).fileChanges, { upsert: [], remove: ['a'] });
  assert.equal(catalogWrite({ ...data, files }, 3, 2).fileChanges, undefined);
  await assert.rejects(
    hydrateFileCatalog({ data, fileCatalog: { total: 2 } }, async () => ({ revision: 3, total: 2, files: [files[0]], nextOffset: null }), 3),
  );
  assert.equal(catalogWrite({ ...data, files }, 3, 3).fileChanges, undefined);
});
